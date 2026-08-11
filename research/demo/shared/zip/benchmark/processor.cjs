const zipPattern = /^[0-9]{5}$/

function requestedPrefix(context) {
  const prefix = context?.vars?.q
  if (typeof prefix !== 'string' || !/^[0-9]{1,5}$/.test(prefix)) {
    throw new Error('Artillery context must contain the requested ASCII ZIP prefix')
  }
  return prefix
}

function validateZipResponse(_requestParams, response, context) {
  if (!response || response.statusCode !== 200) {
    throw new Error(`Expected HTTP 200, received ${response?.statusCode ?? 'unknown'}`)
  }

  const prefix = requestedPrefix(context)
  let payload
  try {
    payload = JSON.parse(response.body)
  } catch {
    throw new Error('Response body must be valid JSON')
  }

  if (!Array.isArray(payload) || payload.length !== 10) {
    throw new Error('Response body must contain exactly 10 records')
  }

  const seen = new Set()
  let previousZip = null
  payload.forEach((entry, index) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new Error(`Record ${index} must be an object`)
    }

    const keys = Object.keys(entry).sort()
    if (keys.length !== 2 || keys[0] !== 'city' || keys[1] !== 'zip') {
      throw new Error(`Record ${index} must contain only zip and city`)
    }

    if (typeof entry.zip !== 'string' || typeof entry.city !== 'string') {
      throw new Error(`Record ${index} must contain string zip and city fields`)
    }

    if (!zipPattern.test(entry.zip)) {
      throw new Error(`Record ${index} zip must be an ASCII five-digit ZIP`)
    }

    if (!entry.zip.startsWith(prefix)) {
      throw new Error(`Record ${index} zip must match requested prefix ${prefix}`)
    }

    if (seen.has(entry.zip)) {
      throw new Error('Response records must contain unique ZIPs')
    }
    seen.add(entry.zip)

    if (previousZip !== null && entry.zip <= previousZip) {
      throw new Error('Response ZIPs must be strictly ascending')
    }
    previousZip = entry.zip
  })
}

function assertZipResponse(requestParams, response, context, ee, next) {
  if (typeof next !== 'function') {
    return validateZipResponse(requestParams, response, context)
  }

  try {
    validateZipResponse(requestParams, response, context)
    next()
  } catch (error) {
    if (ee && typeof ee.emit === 'function') {
      ee.emit('counter', 'zip.invalid_response', 1)
    }
    next(error)
  }
}

module.exports = assertZipResponse
module.exports.assertZipResponse = assertZipResponse
module.exports.validateZipResponse = validateZipResponse
