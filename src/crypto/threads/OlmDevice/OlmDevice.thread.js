import AsyncStorage from '@react-native-community/async-storage'
import { randomBytes } from 'react-native-randombytes'
import { self } from 'react-native-threads'
import { OlmDevice } from '../../OlmDevice'
import AsyncCryptoStore from './AsyncCryptoStore'

global.Olm = require('olm/olm_legacy')

// implement window.getRandomValues(), for packages that rely on it
global.window = {
  crypto: {
    getRandomValues: function getRandomValues(arr) {
      let orig = arr
      if (arr.byteLength != arr.length) {
        // Get access to the underlying raw bytes
        arr = new Uint8Array(arr.buffer)
      }
      const bytes = randomBytes(arr.length)
      for (var i = 0; i < bytes.length; i++) {
        arr[i] = bytes[i]
      }

      return orig
    }
  }
}

// Needed so that 'stream-http' chooses the right default protocol.
global.location = {
  protocol: 'file:',
  href: '',
}

const olmDevice = new OlmDevice(new AsyncCryptoStore(AsyncStorage))

async function main() {
  global.document = {
    currentScript: undefined,
  }
  await global.Olm.init()
  delete global.document

  self.onmessage = async stringifiedMessage => {
    try {
      let message = JSON.parse(stringifiedMessage)

      let result
      if (message.type === 'function') {
        result = await olmDevice[message.name](
          ...message.arguments,
        )
      }

      self.postMessage(prepareMessage({
        ...message,
        state: {
          _pickleKey: olmDevice._pickleKey,
          deviceCurve25519Key: olmDevice.deviceCurve25519Key,
          deviceEd25519Key: olmDevice.deviceEd25519Key,
          _maxOneTimeKeys: olmDevice._maxOneTimeKeys,
          _outboundGroupSessionStore: olmDevice._outboundGroupSessionStore,
          _inboundGroupSessionMessageIndexes: olmDevice._inboundGroupSessionMessageIndexes,
          _sessionsInProgress: olmDevice._sessionsInProgress,
        },
        result,
      }))
    } catch (e) {
      let message = JSON.parse(stringifiedMessage)

      const error = {
        name: e.name,
        message: e.message,
        data: e.data,
        stack: e.stack,
      }

      self.postMessage(prepareMessage({
        ...message,
        error,
      }))
    }
  }
}

main()
  .catch(e => {
    debugger;
    console.error(e)
  })

const prepareMessage = (msg) => JSON.stringify(msg)
