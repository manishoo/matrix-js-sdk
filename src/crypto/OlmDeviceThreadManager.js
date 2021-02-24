import { EventEmitter } from 'events'
import { Thread } from 'react-native-threads'
import { OlmDevice } from './OlmDevice'

const SUPPORTED_METHODS = [
  'init',
  'export',
  'sign',
  'getOneTimeKeys',
  'markKeysAsPublished',
  'generateOneTimeKeys',
  'generateFallbackKey',
  'getFallbackKey',
  'createOutboundSession',
  'createInboundSession',
  'getSessionIdsForDevice',
  'getSessionIdForDevice',
  'getSessionInfoForDevice',
  'encryptMessage',
  'decryptMessage',
  'matchesSession',
  'recordSessionProblem',
  'sessionMayHaveProblems',
  'filterOutNotifiedErrorDevices',
  'addInboundGroupSession',
  'addInboundGroupSessionWithheld',
  'decryptGroupMessage',
  'hasInboundSessionKeys',
  'getInboundGroupSessionKey',
  'verifySignature',
]

// safely handles circular references
JSON.safeStringify = (obj, indent = 2) => {
  let cache = []
  const retVal = JSON.stringify(
    obj,
    (key, value) =>
      typeof value === 'object' && value !== null
        ? cache.includes(value)
        ? undefined // Duplicate reference found, discard key
        : cache.push(value) && value // Store value in our collection
        : value,
    indent
  )
  cache = null
  return retVal
}

export default class OlmDeviceThreadManager extends OlmDevice {
  thread
  inProgress = []
  messageEventEmitter = new EventEmitter()

  constructor(props) {
    super(props)

    this.startThread()

    const self = this

    return new Proxy(this, {
      get(target, name, receiver) {
        if (typeof target[name] === 'function') {
          return function (...args) {
            if (!SUPPORTED_METHODS.includes(name)) {
              return target[name](...args)
            }

            const msg = self.prepareMessage({
              type: 'function',
              name,
              arguments: args
            })
            const promise = self.waitForMessage(msg)
            self.thread.postMessage(msg)
            return promise
          }
        }

        return target[name]
      },
    })
  }

  startThread() {
    this.thread = new Thread('node_modules/matrix-js-sdk/lib/crypto/threads/OlmDevice/OlmDevice.thread.js')
    this.thread.onmessage = this.handleIncomingMessage
  }

  handleIncomingMessage = (incomingMessage) => {
    const message = this.openMessage(incomingMessage)

    this.messageEventEmitter.emit(message.id, message)
  }

  waitForMessage(targetMessageStringified) {
    const targetMessage = this.openMessage(targetMessageStringified)

    return new Promise((resolve, reject) => {
      this.messageEventEmitter.once(targetMessage.id, (message) => {
          if (message.id === targetMessage.id) {
            if (message.error) {
              console.error(`INCOMING ERROR!!! OF ${message.name} IS ===>`, message.error)
              return reject(message.error)
            }

            if (message.state) {
              this._pickleKey = message.state._pickleKey
              this.deviceCurve25519Key = message.state.deviceCurve25519Key
              this.deviceEd25519Key = message.state.deviceEd25519Key
              this._maxOneTimeKeys = message.state._maxOneTimeKeys
              this._outboundGroupSessionStore = message.state._outboundGroupSessionStore
              this._inboundGroupSessionMessageIndexes = message.state._inboundGroupSessionMessageIndexes
              this._sessionsInProgress = message.state._sessionsInProgress
            }

            console.log(`INCOMING RESULT OF ${message.name} IS ===>`, message.result)
            resolve(message.result)
          }
        }
      )
    })
  }

  prepareMessage(msg) {
    const message = {
      ...msg,
      id: Math.random(),
    }

    this.inProgress.push(message)

    return JSON.safeStringify(message)
  }

  openMessage(msg) {
    this.inProgress = this.inProgress.filter(msg => msg.id !== msg.id)

    return JSON.parse(msg)
  }
}

