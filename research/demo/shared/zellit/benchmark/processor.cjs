'use strict'

function fail(message) {
  throw new Error(`Invalid Zellit response: ${message}`)
}

function requestedPage(requestParams, context) {
  const rawUrl = requestParams?.url
  if (typeof rawUrl !== 'string') fail('request URL is missing')

  let parsed
  try {
    parsed = new URL(rawUrl, 'http://artillery.invalid')
  } catch {
    fail('request URL is invalid')
  }
  const match = parsed.pathname.match(/^\/api\/v1\/zip-codes\/([0-9]{5})\/listings$/)
  const limit = parsed.searchParams.get('limit')
  const offset = parsed.searchParams.get('offset')
  if (!match || limit !== '20' || !/^(0|[1-9][0-9]*)$/.test(offset || '')) {
    fail('request must contain the canonical Zellit path, limit, and offset')
  }

  // Artillery may pass the rendered URL or leave templates in requestParams.
  const zipCode = match[1] === '{{ zip_code }}' ? context?.vars?.zip_code : match[1]
  const requestedOffset = Number(offset)
  if (!/^[0-9]{5}$/.test(zipCode || '') || !Number.isSafeInteger(requestedOffset)) {
    fail('request ZIP or offset is invalid')
  }
  return {zipCode, offset: requestedOffset}
}

function object(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label} must be an object`)
  return value
}

function integer(value, label) {
  if (!Number.isSafeInteger(value)) fail(`${label} must be an integer`)
}

function prepareZellitRequest(requestParams, context, _events, next) {
  try {
    const rawZip = String(context?.vars?.zip_code ?? '')
    const zipCode = rawZip.padStart(5, '0')
    const offset = String(context?.vars?.offset ?? '')
    if (!/^[0-9]{5}$/.test(zipCode) || !/^(0|[1-9][0-9]*)$/.test(offset)) {
      fail('request corpus ZIP or offset is invalid')
    }
    context.vars.zip_code = zipCode
    context.vars.offset = offset
    requestParams.url = `/api/v1/zip-codes/${zipCode}/listings?limit=20&offset=${offset}`
    next()
  } catch (error) {
    next(error)
  }
}

function validateZellitResponse(requestParams, response, context) {
  if (!response || response.statusCode !== 200) {
    fail(`expected HTTP 200, received ${response?.statusCode ?? 'unknown'}`)
  }

  let payload
  try {
    payload = JSON.parse(response.body)
  } catch {
    fail('body must be valid JSON')
  }
  object(payload, 'body')
  const requested = requestedPage(requestParams, context)

  const zip = object(payload.zip_code, 'zip_code')
  if (zip.code !== requested.zipCode) fail('ZIP does not match the request')
  const market = object(payload.market, 'market')
  if (market.listing_count !== 200) fail('market listing_count must be 200')
  integer(market.average_price, 'market average_price')

  const pagination = object(payload.pagination, 'pagination')
  if (pagination.limit !== 20 || pagination.offset !== requested.offset || pagination.returned !== 20) {
    fail('pagination does not match the requested full page')
  }
  if (!Array.isArray(payload.listings) || payload.listings.length !== 20) {
    fail('listings must contain exactly 20 records')
  }

  let previousListingId = null
  for (const [listingIndex, listingValue] of payload.listings.entries()) {
    const listing = object(listingValue, `listing ${listingIndex}`)
    integer(listing.id, `listing ${listingIndex} id`)
    integer(listing.vote_score, `listing ${listingIndex} vote_score`)
    if (listing.comment_count !== 3) fail(`listing ${listingIndex} comment_count must be 3`)
    if (listingIndex === 0 && (listing.id - 1) % 200 !== requested.offset) {
      fail('first listing ID does not match the requested page offset')
    }
    if (previousListingId !== null && listing.id !== previousListingId + 1) {
      fail('listing IDs must be consecutive and strictly ascending')
    }
    previousListingId = listing.id

    if (!Array.isArray(listing.photos) || listing.photos.length !== 4) {
      fail(`listing ${listingIndex} must contain four photos`)
    }
    listing.photos.forEach((photoValue, photoIndex) => {
      const photo = object(photoValue, `listing ${listingIndex} photo ${photoIndex}`)
      if (photo.position !== photoIndex) fail(`listing ${listingIndex} photos must be ordered positions 0 through 3`)
    })

    if (!Array.isArray(listing.comments) || listing.comments.length !== 3) {
      fail(`listing ${listingIndex} must contain three comments`)
    }
    let previousCommentId = null
    listing.comments.forEach((commentValue, commentIndex) => {
      const comment = object(commentValue, `listing ${listingIndex} comment ${commentIndex}`)
      integer(comment.id, `listing ${listingIndex} comment ${commentIndex} id`)
      integer(comment.vote_score, `listing ${listingIndex} comment ${commentIndex} vote_score`)
      if (previousCommentId !== null && comment.id <= previousCommentId) {
        fail(`listing ${listingIndex} comment IDs must be strictly ascending`)
      }
      previousCommentId = comment.id
    })
  }
}

function assertZellitResponse(requestParams, response, context, ee, next) {
  if (typeof next !== 'function') return validateZellitResponse(requestParams, response, context)
  try {
    validateZellitResponse(requestParams, response, context)
    next()
  } catch (error) {
    if (ee && typeof ee.emit === 'function') ee.emit('counter', 'zellit.invalid_response', 1)
    next(error)
  }
}

module.exports = assertZellitResponse
module.exports.assertZellitResponse = assertZellitResponse
module.exports.prepareZellitRequest = prepareZellitRequest
module.exports.requestedPage = requestedPage
module.exports.validateZellitResponse = validateZellitResponse
