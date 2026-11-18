/*!
 * body-parser
 * Copyright(c) 2014-2015 Douglas Christopher Wilson
 * MIT Licensed
 */

'use strict'

/**
 * Module dependencies.
 * @private
 */

const createError = require('http-errors')
const getBody = require('raw-body')
const iconv = require('iconv-lite')
const onFinished = require('on-finished')
const zlib = require('node:zlib')
const hasBody = require('type-is').hasBody
const contentType = require('content-type')

/**
 * Module exports.
 */

module.exports = read

/**
 * @const
 * whether current node version has zstandard support
 */
const hasZstandardSupport = 'createZstdDecompress' in zlib

/**
 * Read a request into a buffer and parse.
 *
 * @param {Object} req
 * @param {Object} res
 * @param {Function} next
 * @param {Function} parse
 * @param {Function} debug
 * @param {Object} options
 * @private
 */
function read (req, res, next, parse, debug, options) {
  if (onFinished.isFinished(req)) {
    debug('body already parsed')
    next()
    return
  }

  if (!('body' in req)) {
    req.body = undefined
  }

  // skip requests without bodies
  if (!hasBody(req)) {
    debug('skip empty body')
    next()
    return
  }

  debug('content-type %j', req.headers['content-type'])

  // determine if request should be parsed
  if (!options.shouldParse(req)) {
    debug('skip parsing')
    next()
    return
  }

  let encoding = null
  if (options?.skipCharset !== true) {
    encoding = getCharset(req) || options.defaultCharset

    // validate charset
    if (!!options?.isValidCharset && !options.isValidCharset(encoding)) {
      debug('invalid charset')
      next(createError(415, 'unsupported charset "' + encoding.toUpperCase() + '"', {
        charset: encoding,
        type: 'charset.unsupported'
      }))
      return
    }
  }

  let length
  let stream

  const verify = options.verify

  // assert charset is supported before creating the decompression stream, so an
  // unsupported charset cannot leave a decoder piped with no error listener
  if (verify && encoding !== null && !iconv.encodingExists(encoding)) {
    return next(createError(415, 'unsupported charset "' + encoding.toUpperCase() + '"', {
      charset: encoding.toLowerCase(),
      type: 'charset.unsupported'
    }))
  }

  try {
    const contentEncoding = (req.headers['content-encoding'] || 'identity').toLowerCase()

    debug('content-encoding "%s"', contentEncoding)

    if (options.inflate === false && contentEncoding !== 'identity') {
      throw createError(415, 'content encoding unsupported', {
        encoding: contentEncoding,
        type: 'encoding.unsupported'
      })
    }

    // get the content stream
    if (contentEncoding === 'identity') {
      length = req.headers['content-length']
      stream = req
    } else {
      stream = createDecompressionStream(contentEncoding, debug)
      req.pipe(stream)
    }
  } catch (err) {
    return next(err)
  }

  // set raw-body options
  const rawBodyOptions = {
    length,
    encoding: verify ? null : encoding,
    limit: options.limit
  }

  // read body
  debug('read body')
  getBody(stream, rawBodyOptions, function (error, body) {
    if (error) {
      let _error

      if (error.type === 'encoding.unsupported') {
        // echo back charset
        _error = createError(415, 'unsupported charset "' + encoding.toUpperCase() + '"', {
          charset: encoding.toLowerCase(),
          type: 'charset.unsupported'
        })
      } else {
        // set status code on error
        _error = createError(400, error)
      }

      // unpipe from stream and destroy
      if (stream !== req) {
        req.unpipe()
        stream.destroy()
      }

      // read off entire request
      dump(req, function onfinished () {
        next(createError(400, _error))
      })
      return
    }

    // detach and destroy the decompression stream to
    // avoid decompression errors on the finished stream
    if (stream !== req) {
      req.unpipe(stream)
      stream.on('error', () => {})
      stream.destroy()

      // consume any remaining bytes so the HTTP request can finish
      req.resume()
    }

    // verify
    if (verify) {
      try {
        debug('verify body')
        verify(req, res, body, encoding)
      } catch (err) {
        next(createError(403, err, {
          body,
          type: err.type || 'entity.verify.failed'
        }))
        return
      }
    }

    // parse
    let str = body
    try {
      debug('parse body')
      str = typeof body !== 'string' && encoding !== null
        ? iconv.decode(body, encoding)
        : body
      req.body = parse(str, encoding)
    } catch (err) {
      next(createError(400, err, {
        body: str,
        type: err.type || 'entity.parse.failed'
      }))
      return
    }

    next()
  })
}

/**
 * Create a decompression stream for the given encoding.
 * @param {string} encoding
 * @param {Function} debug
 * @returns {Object}
 * @private
 */
function createDecompressionStream (encoding, debug) {
  switch (encoding) {
    case 'deflate':
      debug('inflate body')
      return zlib.createInflate()
    case 'gzip':
      debug('gunzip body')
      return zlib.createGunzip()
    case 'br':
      debug('brotli decompress body')
      return zlib.createBrotliDecompress()
    case 'zstd':
      if (hasZstandardSupport) {
        debug('zstd decompress body')
        return zlib.createZstdDecompress()
      }
  }
  throw createError(415, 'unsupported content encoding "' + encoding + '"', {
    encoding,
    type: 'encoding.unsupported'
  })
}

/**
 * Dump the contents of a request.
 *
 * @param {Object} req
 * @param {Function} callback
 * @private
 */
function dump (req, callback) {
  if (onFinished.isFinished(req)) {
    callback(null)
  } else {
    onFinished(req, callback)
    req.resume()
  }
}

/**
 * Get the charset of a request.
 *
 * @param {Object} req
 * @returns {string | undefined}
 * @private
 */
function getCharset (req) {
  const header = req.headers['content-type']
  if (!header) return undefined
  return contentType.parse(header).parameters.charset?.toLowerCase()
}
