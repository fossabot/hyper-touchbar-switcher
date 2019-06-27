/* global store */

const path = require('path')
const { exec } = require('child_process')
const color = require('./node_modules/color')
const glob = require('./node_modules/glob')
const untildify = require('./node_modules/untildify')

const ignore = ['**/.git', '**/.svn', '**/.hg', '**/node_modules/**', '**/bower_components/**']

let configuration = {
  fallback: path.join(__dirname, 'images/Hyper@2x.png'),
  iconPosition: 'left',
  tabs: new Map(),
}

const activate = uid =>
  store.dispatch({
    type: 'SESSION_SET_ACTIVE',
    uid,
  })
const build = config => {
  const { colour, dir, fallback, icon, iconPosition, isActive, label, session: uid, title } = {
    ...config,
    ...configuration,
    ...configuration.tabs.get(config.dir),
  }

  return {
    icon: icon ? untildify(icon) : fallback,
    label: labeller(dir, label, title),
    backgroundColor: highlighter(colour, isActive),
    click: activate.bind(null, uid),
    iconPosition,
    uid,
  }
}

const highlighter = (colour, isActive) => {
  if (isActive) {
    return colour
  }

  const cor = color(colour)
  const ratio = 0.5

  return cor.isLight() ? cor.darken(ratio).hex() : cor.lighten(ratio).hex()
}

const decoder = (key, config) =>
  new Promise(resolve => {
    if (glob.hasMagic(key)) {
      glob(`${key}/`, { ignore }, (_, matches) => {
        const part = matches.map(match => [match.slice(0, -1), config])

        resolve(new Map(part))
      })
    } else {
      resolve(new Map([key, config]))
    }
  })
const directory = pid =>
  new Promise(resolve =>
    exec(`lsof -p ${pid} | awk '$4=="cwd"' | tr -s ' ' | cut -d ' ' -f9-`, (_, stdout) => resolve(stdout.trim())),
  )
const expander = async config => {
  const { tabs } = config

  for (const key in tabs) {
    if (Object.prototype.hasOwnProperty.call(tabs, key)) {
      const part = await decoder(key, tabs[key]) // eslint-disable-line no-await-in-loop

      configuration = {
        ...configuration,
        tabs: new Map([...configuration.tabs, ...part]),
      }
    }
  }
}

const populate = tabs => {
  const electron = require('electron')

  const window = (() => ('remote' in electron ? electron.remote.getCurrentWindow() : this))()

  const TouchBar = (() =>
    'TouchBar' in electron ? electron.TouchBar : 'remote' in electron ? electron.remote.TouchBar : null)()

  if (TouchBar) {
    const { TouchBarButton } = TouchBar

    const buttons = tabs.map(build).map(config => new TouchBarButton(config))

    window.setTouchBar(
      new TouchBar({
        items: buttons,
      }),
    )
  } else {
    console.error('Touch Bar not supported or not found')
  }
}

const labeller = (dir, label, title) => {
  switch (label) {
    case 'none':
      return ''
    case 'dir':
      return dir
    case 'title':
      return title
    default:
      return title
  }
}

exports.getTabsProps = (_, props) => {
  const { tabs } = props

  const { termGroups, sessions } = store.getState()
  const activeSessionList = termGroups.activeSessions
  const sessionList = sessions.sessions

  try {
    Promise.all(
      tabs.map(async tab => {
        const session = activeSessionList[tab.uid]
        const { pid } = sessionList[session]

        const dir = await directory(pid)

        return {
          ...tab,
          dir,
          pid,
          session,
        }
      }),
    ).then(populate)
  } catch (error) {
    console.error(error)
  }

  return props
}

exports.middleware = _ => next => action => {
  const { config, type } = action

  switch (type) {
    case 'CONFIG_LOAD':
    case 'CONFIG_RELOAD':
      if (config.touchbarSwitches) {
        expander(config.touchbarSwitches)
      }

      break
    default:
      break
  }

  next(action)
}
