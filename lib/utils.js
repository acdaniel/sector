
exports.define = function (properties /*, mixins... */) {
  var child, mixins = [], parent = this;
  if (properties && exports.has(properties, 'constructor')) {
    child = properties.constructor;
  } else {
    child = function () { return parent.apply(this, arguments); };
  }
  child.prototype = exports.create(parent.prototype, properties);
  exports.extend(child, parent);
  exports.bindAll(child);
  if (arguments.length > 1) {
    mixins = new Array(arguments.length - 1);
    for (var i = 1, l = mixins.length; i <= l; i++) {
      mixins[i - 1] = arguments[i];
    }
  }
  exports.mixin.call(child.prototype, mixins);
  return child;
};

exports.mixin = function (mixins) {
  if (!mixins) { return; }
  this._mixins = exports.has(this, '_mixins') ? this._mixins : [];
  exports.forEach(mixins, function (mixin) {
    if (this._mixins.indexOf(mixin) === -1) {
      mixin.call(this);
      this._mixins.push(mixin);
    }
  }, this);
};

exports.documentReady = function (func) {
  if (window.document.readyState === 'complete' ||
      window.document.readyState === 'loaded' ||
      window.document.readyState === 'interactive') {
    func();
  } else {
    window.document.addEventListener('DOMContentLoaded', func);
  }
};

exports.select = function (el, selector, one) {
  if ('undefined' === one) {
    one = selector || false;
    selector = el;
    el = null;
  }
  if (!selector) {
    selector = el;
    el = null;
  }
  el = el || window.document;
  return one ? el.querySelector(selector) : el.querySelectorAll(selector);
};

exports.matches = function(el, selector) {
  // borrowed from http://youmightnotneedjquery.com/
  var _matches = (el.matches || el.matchesSelector || el.msMatchesSelector || el.mozMatchesSelector || el.webkitMatchesSelector || el.oMatchesSelector);
  if (_matches) {
    return _matches.call(el, selector);
  } else {
    var nodes = el.parentNode.querySelectorAll(selector);
    for (var i = nodes.length; i--;) {
      if (nodes[i] === el) { return true; }
    }
    return false;
  }
};

exports.addClassName = function (el, className) {
  var regex = new RegExp('(^|\\s)' + className + '(\\s|$)');
  if (!regex.test(el.className)) {
    el.className = (el.className + ' ' + className).trim();
  }
};

exports.removeClassName = function (el, className) {
  var regex, classes = className.split(' ');
  for (var i = 0, l = classes.length; i < l; i++) {
    regex = new RegExp('(^|\\s)' + className + '(\\s|$)');
    el.className = el.className.replace(regex, ' ').trim();
  }
};

exports.createEvent = function (type, data, options) {
  var e;
  options = options || { bubbles: false, cancelable: false};
  if (typeof CustomEvent === 'function') {
    e = new CustomEvent(type,
      {detail: data, bubbles: options.bubbles, cancelable: options.cancelable}
    );
  } else {
    e = window.document.createEvent('CustomEvent');
    e.initCustomEvent(type, options.bubbles, options.cancelable, data);
  }
  return e;
};

exports.getObjectPath = function (obj, path) {
  var parts = path.split('.');
  return parts.reduce(function (o, k) {
    return o[k];
  }, obj);
};

exports.setObjectPath = function (obj, path, value) {
  var o = obj, parts = path.split('.');
  for (var i = 0, l = parts.length; i < l; i++) {
    if (i < l - 1) {
      if (!exports.has(o, parts[i])) {
        o[parts[i]] = {};
      }
      o = o[parts[i]];
    } else {
      o[parts[i]] = value;
    }
  }
};

exports.extend = require('lodash-node/modern/objects/assign');
exports.extend(exports, require('./utils-ext-global'));
exports.extend(exports, require('./utils-ext-require'));