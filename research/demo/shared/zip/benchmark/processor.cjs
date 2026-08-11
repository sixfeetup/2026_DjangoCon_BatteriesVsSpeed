const zipPattern = /^[0-9]{5}$/

function validateZipResponse(_requestParams, response) {
  if (!response || response.statusCode !== 200) {
    throw new Error(`Expected HTTP 200, received ${response?.statusCode ?? 'unknown'}`)
  }

  let payload
  try {
    payload = JSON.parse(response.body)
  } catch {
    throw new Error('Response body must be valid JSON')
  }

  if (!Array.isArray(payload) || payload.length !== 10) {
    throw new Error('Response body must contain exactly 10 records')
  }

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
  })
}

function assertZipResponse(requestParams, response, _context, ee, next) {
  if (typeof next !== 'function') {
    return validateZipResponse(requestParams, response)
  }

  try {
    validateZipResponse(requestParams, response)
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
