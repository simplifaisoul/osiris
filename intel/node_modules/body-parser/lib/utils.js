'use strict'

/**
 * Module dependencies.
 */

const bytes = require('bytes')
const typeis = require('type-is')

/**
 * Module exports.
 */
module.exports = {
  normalizeOptions,
  passthrough
}

/**
 * Get the simple type checker.
 *
 * @param {string | string[]} type
 * @returns {Function}
 * @private
 */
function typeChecker (type) {
  return function checkType (req) {
    return Boolean(typeis(req, type))
  }
}

/**
 * Normalizes the common options for all parsers.
 *
 * @param {Object} options options to normalize
 * @param {string | string[] | Function} defaultType default content type(s) or a function to determine it
 * @returns {Object}
 * @private
 */
function normalizeOptions (options, defaultType) {
  if (!defaultType) {
    // Parsers must define a default content type
    throw new TypeError('defaultType must be provided')
  }

  const inflate = options?.inflate !== false
  const limit = typeof options?.limit === 'undefined' || options?.limit === null
    ? 102400 // 100kb default
    : bytes.parse(options.limit)
  const type = options?.type || defaultType
  const verify = options?.verify || false
  const defaultCharset = options?.defaultCharset || 'utf-8'

  if (limit === null) {
    throw new TypeError(`option limit "${String(options.limit)}" is invalid`)
  }

  if (verify !== false && typeof verify !== 'function') {
    throw new TypeError('option verify must be function')
  }

  // create the appropriate type checking function
  const shouldParse = typeof type !== 'function'
    ? typeChecker(type)
    : type

  return {
    inflate,
    limit,
    verify,
    defaultCharset,
    shouldParse
  }
}

/**
 * Passthrough function that returns input unchanged.
 * Used by parsers that don't need to transform the data.
 *
 * @param {*} value
 * @returns {*}
 * @private
 */
function passthrough (value) {
  return value
}
