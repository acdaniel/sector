exports.extend = require('lodash-node/modern/objects/assign');
exports.extend(exports, require('./utils-ext-global'));
exports.extend(exports, require('./utils-ext-require'));

// Defines a new class by adding the given properties to 'this'
// prototype and then applying the given mixins.
exports.define = function (properties /*, mixins... */) {
  var child, mixins = [], parent = this;
  // if a constructor is provided in the properties use it otherwise create
  // one based on the parent
  if (properties && exports.has(properties, 'constructor')) {
    child = properties.constructor;
  } else {
    child = function () { return parent.apply(this, arguments); };
  }
  child.prototype = exports.create(parent.prototype, properties);
  exports.extend(child, parent);
  exports.bindAll(child);
  // apply all the mixins
  if (arguments.length > 1) {
    mixins = new Array(arguments.length - 1);
    for (var i = 1, l = mixins.length; i <= l; i++) {
      mixins[i - 1] = arguments[i];
    }
  }
  exports.mixin.call(child.prototype, mixins);
  return child;
};

// Applies the given array of mixins to 'this'
exports.mixin = function (mixins) {
  if (!mixins) { return; }
  this._mixins = exports.has(this, '_mixins') ? this._mixins : [];
  exports.forEach(mixins, function (mixin) {
    // if the mixin has already been applied, skip it
    if (this._mixins.indexOf(mixin) === -1) {
      mixin.call(this);
      this._mixins.push(mixin);
    }
  }, this);
};

// Convenience method detecting when the DOM is loaded and calling the given
// function
exports.documentReady = function (func) {
    // if the document is already loaded, call the function
  if (document.readyState === 'complete' ||
      document.readyState === 'loaded' ||
      document.readyState === 'interactive') {
    func();
  } else {
    document.addEventListener('DOMContentLoaded', func);
  }
};

// Wraps 'querySelectorAll' and defaults the parent to document
exports.selectAll = function (selector, parent) {
  parent = parent || document;
  return parent.querySelectorAll(selector);
};

// Wraps 'querySelector' and defaults the parent to document
exports.select = function (selector, parent) {
    parent = parent || document;
    return parent.querySelector(selector);
};

// Returns true if the given element matches the given selector
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

// Adds the given className to the element unless it is already added
exports.addClassName = function (el, className) {
  var regex, classes = className.split(' ');
  for (var i = 0, l = classes.length; i < l; i++) {
    regex = new RegExp('(^|\\s)' + classes[i] + '(\\s|$)');
    if (!regex.test(el.className)) {
      el.className = (el.className + ' ' + classes[i]).trim();
    }
  }
};

// Removes the given className to the element
exports.removeClassName = function (el, className) {
  var regex, classes = className.split(' ');
  for (var i = 0, l = classes.length; i < l; i++) {
    regex = new RegExp('(^|\\s)' + classes[i] + '(\\s|$)');
    el.className = el.className.replace(regex, ' ').trim();
  }
};

// If the given className in already added to the element, then it is removed
// otherwise it is added
exports.toggleClassName = function (el, className) {
  var regex, classes = className.split(' ');
  for (var i = 0, l = classes.length; i < l; i++) {
    regex = new RegExp('(^|\\s)' + classes[i] + '(\\s|$)');
    if (!regex.test(el.className)) {
      el.className = (el.className + ' ' + classes[i]).trim();
    } else {
      el.className = el.className.replace(regex, ' ').trim();
    }
  }
};

// Creates a crossbrowser event
exports.createEvent = function (type, data, options) {
  var e;
  options = options || { bubbles: false, cancelable: false};
  if (typeof CustomEvent === 'function') {
    e = new CustomEvent(type,
      {detail: data, bubbles: options.bubbles, cancelable: options.cancelable}
    );
  } else {
    e = document.createEvent('CustomEvent');
    e.initCustomEvent(type, options.bubbles, options.cancelable, data);
  }
  return e;
};

// Follows the given property path on the object and returns the value
// i.e. 'name.first'
exports.getObjectPath = function (obj, path) {
  var parts = path.split('.');
  return parts.reduce(function (o, k) {
    return o && exports.has(o, k) ? o[k] : undefined;
  }, obj);
};

// Sets the value at the given property path on the object
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

// Takes an object that represents HTML and returns a document fragment
// { p: {'span.myclass': 'Click ', 'a#mylink': { '@': { href: 'http://example.com' }, text: 'Here' } } } }
// would produce
// <p><span class="myclass">Click </span><a id="mylink" href="http://example.com">Here</a></p>
exports.buildHtml = function (obj, hooks) {
  hooks = hooks || {};
  var buildElement = function (parent, key, content) {
    var el, tagName, id, className;
    if (key === '@') {
      exports.forIn(content, function (value, attr) {
        parent.setAttribute(attr, value.toString());
        if (hooks.attribute) {
          hooks.attribute(parent, attr);
        }
      });
    } else if (key === 'text') {
      el = document.createTextNode(content.toString());
    } else if (key === 'html') {
      parent.innerHTML = content.toString();
    } else {
      var matches = key.match(/^([a-z][\w0-9-]*)?(?:#([a-z][\w0-9-]*))?((?:\.([a-z][\w0-9-]*))+)?$/i);
      tagName = matches[1] || 'div';
      id = matches[2] || null;
      className = matches[3] ? matches[3].replace(/\./g,' ').trim() : null;
      el = document.createElement(tagName);
      if (id) { el.id = id; }
      if (className) { el.className = className; }
      if (exports.isString(content)) {
        el.textContent = content;
      } else {
        exports.forIn(content, function (value, name) {
          buildElement(el, name, value);
        });
      }
    }
    if (el) {
      if (hooks.element) {
        hooks.element(el);
      }
      parent.appendChild(el);
    }
  };
  var frag = document.createDocumentFragment();
  exports.forIn(obj, function (value, key) {
    buildElement(frag, key, value);
  }, this);
  return frag;
};

var animLastTime = 0;
// Crossbrowser 'requestAnimationFrame' implementation
exports.requestAnimationFrame = exports.bind(window.requestAnimationFrame ||
    window.mozRequestAnimationFrame || window.webkitRequestAnimationFrame ||
    window.msRequestAnimationFrame, window);

if (!exports.requestAnimationFrame) {
  exports.requestAnimationFrame = exports.bind(function (callback) {
    var currTime = new Date().getTime();
    var timeToCall = Math.max(0, 16 - (currTime - animLastTime));
    var id = window.setTimeout(function() { callback(currTime + timeToCall); },
      timeToCall);
    animLastTime = currTime + timeToCall;
    return id;
  }, window);
}

// Crossbrowser 'cancelAnimationFrame' implementation
exports.cancelAnimationFrame = exports.bind(window.cancelAnimationFrame ||
  window.mozCancelAnimationFrame || window.webkitCancelAnimationFrame ||
  window.msCancelAnimationFrame, window);

if (!exports.cancelAnimationFrame) {
  exports.cancelAnimationFrame = exports.bind(function(id) {
    clearTimeout(id);
  }, window);
}

// Simple easing function used by animation
exports.easing = {
  linear: function (t, b, c, d) {
    return c * (t /= d) + b;
  },
  easeIn: function (t, b, c, d) {
    t /= d;
    return c * t * t + b;
  },
  easeOut: function (t, b, c, d) {
    t /= d;
    return -c * t * (t - 2) + b;
  },
  easeInOut: function (t, b, c, d) {
    t /= d / 2;
    if (t < 1) { return c / 2 * t * t + b; }
    t--;
    return -c / 2 * (t * (t - 2) - 1) + b;
  }
};

exports.animate = function (startValue, endValue, options, thisArg) {
  options = options || {};
  exports.defaults(options, {
    duration: 1000,
    step: exports.noop,
    easing: exports.easing.linear,
    complete: exports.noop
  });
  if (exports.isString(options.easing)) {
    options.easing = exports.easing[options.easing];
  }
  startValue = parseFloat(startValue);
  endValue = parseFloat(endValue);
  var changeValue = endValue - startValue, startTime = +new Date();
  var step = function () {
    var currentTime = +new Date(),
        lapsedTime = currentTime - startTime,
        rate = Math.min(1, lapsedTime / options.duration),
        val = options.easing(lapsedTime, startValue, changeValue, options.duration);
    if (rate < 1) {
      if (options.step.call(thisArg, rate, val) !== false) {
        exports.requestAnimationFrame(step);
      }
    } else {
      options.step.call(thisArg, 1, endValue);
      options.complete.call(thisArg, 1, endValue);
    }
  };
  step();
};
