/**
 * sector v0.1.12
 * A component and pub/sub based UI library for javascript applications.
 * https://github.com/acdaniel/sector
 *
 * Copyright 2014 Adam Daniel <adam@acdaniel.com>
 * Released under the MIT license
 *
 * Date: 2014-04-09T02:09:24.798Z
 */
!function(e){if("object"==typeof exports)module.exports=e();else if("function"==typeof define&&define.amd)define(e);else{var f;"undefined"!=typeof window?f=window:"undefined"!=typeof global?f=global:"undefined"!=typeof self&&(f=self),f.sector=e()}}(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);throw new Error("Cannot find module '"+o+"'")}var f=n[o]={exports:{}};t[o][0].call(f.exports,function(e){var n=t[o][1][e];return s(n?n:e)},f,f.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(_dereq_,module,exports){
var utils = _dereq_('./utils'),
    registry = _dereq_('./registry'),
    Hooked = _dereq_('./mixins/hooked'),
    Traceable = _dereq_('./mixins/traceable'),
    Listener = _dereq_('./mixins/listener'),
    PubSub = _dereq_('./mixins/pubsub');

var Component = function (options) {
  var self = this;
  var initOptions = utils.omit(options, 'el');
  var specialOptions = utils.pick(options, 'el');
  var defaults = utils.result(this, 'defaults');
  var props = utils.pick(initOptions, function (value, key) {
    return utils.has(defaults, key) || key === 'id';
  });
  utils.defaults(this, props, defaults);
  if (!this.id) {
    this.id = utils.uniqueId('i');
  }
  if (utils.has(specialOptions, 'el')) {
    this.el = utils.isString(specialOptions.el) ?
      utils.select(specialOptions.el, true) : specialOptions.el;
    this.el.id = this.id;
    this.el.addEventListener('DOMNodeRemoved', function (event) {
      if (event.target === self.el) {
        self.el.removeEventListener('DOMNodeRemoved', this);
        self.destroy();
      }
    }, false);
    this.after('destroy', function () {
      this.el = undefined;
    });
  }
  registry.addInstance(this);
  this.initialize.call(this, initOptions);
};

Component.prototype.select = function (selector, one) {
  return utils.select(this.el, selector, one);
};

Component.prototype.toString = function () {
  return '[' + this.type + ' ' + this.id + ']';
};

Component.prototype.defaults = null;

Component.prototype.initialize = utils.noop;

Component.prototype.destroy = utils.noop;

Component.define = function (properties /*, mixins... */) {
  var args, comp;
  if (!properties.type) {
    properties.type = utils.uniqueId('c');
  }
  args = Array.prototype.slice.call(arguments, 1);
  args.unshift(properties, Hooked, Traceable, Listener, PubSub);
  comp = utils.define.apply(this, args);
  registry.addComponent(comp);
  return comp;
};

Component.attachTo = function (selector, options) {
  var construct = this, instance, elements;
  options = options || {};
  elements = utils.isString(selector) ? utils.select(selector) : [selector];
  for (var i = 0, l = elements.length; i < l; i++) {
    options.el = elements[i];
    options.id = options.id || elements[i].id;
    instance = new construct(options);
  };
};

Component.destroyAll = function () {
  var instances = registry.findInstancesOf(this.prototype.type);
  for (var i = 0, l = instances.length; i < l; i++) {
    instances[i].destroy();
    registry.removeInstance(instances[i]);
  }
};

module.exports = Component;
},{"./mixins/hooked":4,"./mixins/listener":5,"./mixins/pubsub":6,"./mixins/traceable":7,"./registry":10,"./utils":12}],2:[function(_dereq_,module,exports){

exports.Component = _dereq_('./component');

exports.init = function (func, options, root) {
  var argsLength = arguments.length;
  if (argsLength === 1 && !exports.utils.isFunction(arguments[0])) {
    options = arguments[0];
    func = null;
  }
  root = root || window.document;
  options = options || {};
  exports.utils.defaults(options, {
    publishProgress: false,
    ignoreNotFound: false,
    componentSelector: '[data-component]',
    componentAttribute: 'data-component',
    optionsAttribute: 'data-attrs',
    optionsAttrPrefix: 'data-attr-',
    readyTopic: 'ui.ready',
    initializingTopic: 'ui.initializing'
  });
  var pub = function (topic, data) {
    var e = exports.utils.createEvent('pubsub.' + topic,
      { topic: topic, data: data }
    );
    window.document.dispatchEvent(e);
  };
  exports.utils.documentReady(function () {
    if (func) { func(); }
    var nodes = [].slice.call(root.querySelectorAll(options.componentSelector));
    var componentCount = nodes.length;
    function deferedForEach (fn) {
      var arr = this, i = 0, l = this.length;
      function next () {
        if (i >= l) { return; }
        fn(arr[i], i++);
        exports.utils.defer(next);
      }
      next();
    }
    var f = options.publishProgress ? deferedForEach : Array.prototype.forEach;
    f.call(nodes, function (node, index) {
      if (options.publishProgress) {
        pub(options.initializingTopic, {
          componentCount: componentCount,
          progress: 100 * ((index + 1) / componentCount)
        });
      }
      var el, componentOptions = {}, attrs, type, component, optAttrPrefixLength;
      type = node.getAttribute(options.componentAttribute);
      componentOptions.id = node.id;
      if (node.hasAttribute(options.optionsAttribute)) {
        componentOptions = JSON.parse(node.getAttribute(options.optionsAttribute));
      } else {
        attrs = [].slice.call(node.attributes);
        optAttrPrefixLength = options.optionsAttrPrefix.length;
        attrs.forEach(function (attr) {
          if (attr.name.substr(0, optAttrPrefixLength) === options.optionsAttrPrefix) {
            componentOptions[attr.name.substr(optAttrPrefixLength)] = attr.value;
          }
        });
      }
      el = (node.tagName.toLowerCase() === 'script') ? root : node;
      component = exports.registry.findComponent(type);
      if (component) {
        component.attachTo(el, componentOptions);
      } else if (!options.ignoreNotFound) {
        throw new Error('component ' + type + ' not found');
      }
    });
    pub(options.readyTopic, {});
  });
};

exports.mixins = {
  Hooked: _dereq_('./mixins/hooked'),
  Traceable: _dereq_('./mixins/traceable'),
  Listener: _dereq_('./mixins/listener'),
  PubSub: _dereq_('./mixins/pubsub'),
  View: _dereq_('./mixins/view'),
  Bound: _dereq_('./mixins/bound'),
  Validator: _dereq_('./mixins/validator')
};

exports.components = {};

exports.ext = {};

exports.utils = _dereq_('./utils');

exports.registry = _dereq_('./registry');
},{"./component":1,"./mixins/bound":3,"./mixins/hooked":4,"./mixins/listener":5,"./mixins/pubsub":6,"./mixins/traceable":7,"./mixins/validator":8,"./mixins/view":9,"./registry":10,"./utils":12}],3:[function(_dereq_,module,exports){
var utils = _dereq_('../utils');

module.exports = function Bound () {

  this.defaults = utils.defaults({}, this.defaults, {
    data: null,
    binding: null
  });

  this.update = function (obj) {
    if (obj) {
      this.data = obj;
    }
    var traverse = utils.bind(function (obj, path) {
      var value;
      for (var key in obj) {
        value = obj[key];
        var newPath = path ? path + '.' + key : key;
        if ('object' === typeof value) {
          traverse(value, newPath);
        } else {
          this.setDOMValue(newPath, value);
        }
      }
    }, this);
    traverse(this.data, '');
  };

  this.set = function (key, value) {
    this.setDataValue(key, value);
    this.setDOMValue(key, value);
  };

  this.get = function (key) {
    return utils.getObjectPath(this.data, key);
  };

  this.bind = function () {
    if (this.binding) {
      this._pathBinding = this._pathBinding || {};
      utils.forIn(this.binding, function (binding, selector) {
        if (utils.isString(binding)) {
          binding = { path: binding };
        }
        var nodes, path = binding.path, events = binding.events || ['change'];
        if (selector === '$') {
          nodes = [this.el];
        } else if (this.ui && utils.has(this.ui, selector)) {
          nodes = [this.ui[selector]];
        } else {
          nodes = [].slice.call(this.select(selector));
        }
        nodes.forEach(utils.bind(function (node) {
          if (node.tagName === 'INPUT' || node.tagName === 'SELECT' || node.tagName === 'TEXTAREA') {
            utils.forIn(events, function (eventName) {
              this.listenTo(node, eventName + ':bound', function (event) {
                var value, el = event.target;
                if (el.type.toLowerCase() === 'checkbox' || el.type.toLowerCase() === 'radio') {
                  value = 'undefined' === typeof el.value ? true : el.value;
                  value = el.checked ? value : undefined;
                } else {
                  value = el.value;
                }
                this.set(path, value);
              });
            }, this);
          }
        }, this));
        binding.selector = selector;
        this._pathBinding[path] = this._pathBinding[path] || [];
        this._pathBinding[path].push(binding);
      }, this);
      this._isBound = true;
    }
  };

  this.unbind = function () {
    if (this.binding && this._isBound) {
      this._pathBinding = {};
      utils.forIn(this.binding, function (binding, selector) {
        if (utils.isString(binding)) {
          binding = { path: binding };
        }
        var nodes, events = binding.events || ['change'];
        if (selector === '$') {
          nodes = [this.el];
        } else if (this.ui && utils.has(this.ui, selector)) {
          nodes = [this.ui[selector]];
        } else {
          nodes = [].slice.call(this.select(selector));
        }
        nodes.forEach(utils.bind(function (node) {
          if (node.tagName === 'INPUT' || node.tagName === 'SELECT' || node.tagName === 'TEXTAREA') {
            utils.forIn(events, function (eventName) {
              this.stopListening(node, eventName + ':bound');
            }, this);
          }
        }, this));
      }, this);
    }
  };

  this.setDOMValue = function (key, value) {
    var nodes;
    if (utils.has(this._pathBinding, key)) {
      utils.forIn(this._pathBinding[key], function (binding) {
        if (binding.selector === '$') {
          nodes = [this.el];
        } else if (this.ui && utils.has(this.ui, binding.selector)) {
          nodes = [this.ui[binding.selector]];
        } else {
          nodes = [].slice.call(this.select(binding.selector));
        }
        if (binding.formatter) {
          if (utils.isString(binding.formatter)) {
            binding.formatter = this[binding.formatter];
          }
          value = binding.formatter.call(this, value);
        }
        nodes.forEach(function (node) {
          if (binding.property) {
            utils.setObjectPath(node, binding.property, value);
          } else if (binding.attribute) {
            node.setAttribute(binding.attribute, value.toString());
          } else if (binding.html) {
            node.innerHTML = value.toString();
          } else if (node.tagName === 'INPUT' || node.tagName === 'SELECT' || node.tagName === 'TEXTAREA') {
            if (node.type.toLowerCase() === 'checkbox') {
              node.checked = (value === true || value === 1 || value === 'true');
            } else if (node.type.toLowerCase() === 'radio') {
              node.checked = node.value === value.toString();
            } else {
              node.value = value.toString();
            }
          } else {
            node.textContent = value.toString();
          }
        });
      }, this);
    }
  };

  this.setDataValue = function (key, value) {
    utils.setObjectPath(this.data, key, value);
  };

  if (utils.has(this, 'render')) {
    this.around('render', function (render, data) {
      this.unbind();
      render.call(this, data);
      this.bind();
      this.update(data);
    });
  }

  this.before('initialize', function (options) {
    this.data = this.data || options.data || {};
    this.bind();
    this.update();
  });
};

},{"../utils":12}],4:[function(_dereq_,module,exports){
var utils = _dereq_('../utils');

module.exports = function Hooked () {
  this.after = function (method, afterFunc) {
    var oFunc = this[method];
    this[method] = function composedFunc () {
      oFunc.apply(this, arguments);
      afterFunc.apply(this, arguments);
    };
  };

  this.before = function (method, beforeFunc) {
    var oFunc = this[method];
    this[method] = function composedFunc () {
      beforeFunc.apply(this, arguments);
      oFunc.apply(this, arguments);
    };
  };

  this.around = function (method, wrapFunc) {
    var oFunc = this[method];
    utils.bind(oFunc, this);
    this[method] = utils.wrap(oFunc, wrapFunc);
  };
};
},{"../utils":12}],5:[function(_dereq_,module,exports){
var utils = _dereq_('../utils');

module.exports = function Listener () {

  this.listenTo = function (el, event, func) {
    if (!func) {
      func = event;
      event = el;
      el = this.el;
    }
    if (utils.isString(el)) {
      el = this.select(el);
    }
    var eventParts = event.split(':', 2);
    var eventName = eventParts[0], eventNamespace = eventParts[1] || '_';
    func = utils.isString(func) ? this[func] : func;
    this._listeners = this._listeners || {};
    var removedListener = function (event) {
      var e = event.target;
      if (e !== el) { return; }
      var eid;
      if (e === window) {
        eid = 'window';
      } else if (e === window.document) {
        eid = 'document';
      } else if ('function' !== typeof e.getAttribute) {
        return;
      } else {
        eid = e.getAttribute('data-sector-eid');
      }
      if (this._listeners[eid]) {
        this.trace('element removed', el);
        this.stopListening(el);
      }
    };
    var listener = function (event) {
      this.trace && this.trace('<- ' + event.target + '.' + event.type);
      func.apply(this, arguments);
    };
    if (!el) { return; }
    var eid;
    if (el === window) {
      eid = 'window';
    } else if (el === window.document) {
      eid = 'document';
    } else {
      eid = el.getAttribute('data-sector-eid');
    }
    if (!eid) {
      eid = utils.uniqueId('e');
      el.setAttribute('data-sector-eid', eid);
    }
    if (!this._listeners[eid]) {
      this._listeners[eid] = {};
      this._listeners[eid].DOMNodeRemoved = utils.bind(removedListener, this);
      el.addEventListener('DOMNodeRemoved', this._listeners[eid].DOMNodeRemoved, false);
    }
    if (!this._listeners[eid][eventNamespace]) {
      this._listeners[eid][eventNamespace] = {};
    }
    if (this._listeners[eid][eventNamespace][eventName]) {
      this.trace && this.trace('<x> ' + el + '.' + eventName + ':' + eventNamespace);
      el.removeEventListener(eventName, this._listeners[eid][eventNamespace][eventName], false);
    }
    this._listeners[eid][eventNamespace][eventName] = utils.bind(listener, this);
    this.trace && this.trace('<+> ' + el + '.' + eventName + ':' + eventNamespace);
    el.addEventListener(eventName, this._listeners[eid][eventNamespace][eventName], false);
  };

  this.stopListening = function (el, event) {
    if (!event && utils.isString(el)) {
      event = el;
      el = this.el;
    }
    if (utils.isString(el)) {
      el = this.select(el);
    }
    if (!el) { return; }
    var eid, en, ev;
    if (el === window) {
      eid = 'window';
    } else if (el === window.document) {
      eid = 'document';
    } else {
      eid = el.getAttribute('data-sector-eid');
    }
    if (!this._listeners || !this._listeners[eid]) { return; }
    if (!event) {
      for (en in this._listeners[eid]) {
        for (ev in this._listeners[eid][en]) {
          this.trace && this.trace('<x> ' + el + '.' + ev + ':' + en);
          el.removeEventListener(ev, this._listeners[eid][en][ev]);
          delete this._listeners[eid][en][ev];
        }
        delete this._listeners[eid][en];
      }
    } else {
      var eventParts = event.split(':', 2);
      var eventName = eventParts[0] || '*', eventNamespace = eventParts[1] || '*';
      if (eventNamespace === '*') {
        for (en in this._listeners[eid]) {
          for (ev in this._listeners[eid][en]) {
            if (ev === eventName) {
              this.trace && this.trace('<x> ' + el + '.' + ev);
              el.removeEventListener(ev, this._listeners[eid][en][ev]);
              delete this._listeners[eid][en][ev];
            }
          }
        }
      } else {
        if (event && !this._listeners[eid][eventNamespace]) { return; }
        for (ev in this._listeners[eid][eventNamespace]) {
          if (eventName === '*' || ev === eventName) {
            this.trace && this.trace('<x> ' + el + '.' + ev);
            el.removeEventListener(ev, this._listeners[eid][eventNamespace][ev]);
            delete this._listeners[eid][eventNamespace][ev];
          }
        }
        if (this._listeners[eid][eventNamespace].length === 0) {
          delete this._listeners[eid][eventNamespace];
        }
      }
    }
    if (this._listeners[eid].length === 0) {
      delete this._listeners[eid];
    }
  };

  this.before('destroy', function () {
    var el;
    for (var eid in this._listeners) {
      if (eid === 'window') {
        el = window;
      } else if (eid === 'document') {
        el = window.document;
      } else {
        el = window.document.querySelector('[data-sector-eid=' + eid + ']');
      }
      this.stopListening(el);
    }
  });
};
},{"../utils":12}],6:[function(_dereq_,module,exports){
var utils = _dereq_('../utils');

module.exports = function PubSub () {

  this.publish = function (topic, data) {
    this.trace && this.trace('=>> ' + topic , data);
    var message = '', parts = topic.split('.'), delim = 'pubsub.';
    var dispatch = function (e) {
      window.document.dispatchEvent(e);
    };
    for (var i = 0, l = parts.length; i < l; i++) {
      message += delim + parts[i];
      var e = utils.createEvent(message, { topic: topic, data: data });
      utils.defer(dispatch, e);
      delim = '.';
    }
  };

  this.subscribe = function (topic, func) {
    this.trace && this.trace('<<+>> ' + topic);
    func = utils.isString(func) ? this[func] : func;
    this.listenTo(window.document, 'pubsub.' + topic, function (e) {
      this.trace && this.trace('<<= ' + e.detail.topic, e.detail.data);
      func.call(this, {topic: e.detail.topic, data: e.detail.data});
    });
  };

  this.unsubscribe = function (topic) {
    this.trace && this.trace('<<x>> ' + (topic || 'all'));
    this.stopListening(window.document, 'pubsub.' + topic);
  };
};
},{"../utils":12}],7:[function(_dereq_,module,exports){
var utils = _dereq_('../utils');

module.exports = function Traceable() {
  if (!console) { return; }

  this.defaults = utils.defaults({}, this.defaults, { debug: false });

  this.trace = function (message, data) {
    if (this.debug) {
      console.log(this + ' ' + message, data);
    }
  };

  this.after('initialize', function (options) {
    this.trace('initialized', options);
  });

  this.after('destroy', function () {
    this.trace('destroyed');
  });
};
},{"../utils":12}],8:[function(_dereq_,module,exports){
var utils = _dereq_('../utils');

module.exports = function Validator () {

  this.defaults = utils.defaults({}, this.defaults, {
    validation: null,
    invalidClassName: 'invalid',
    validityMessages: {
      required: 'Please enter a value for this field',
      min: 'Value must be greater than or equal to {0}',
      max: 'Value must be less than or equal to {0}',
      step: 'Value must be in increments of {0}',
      range: 'Value must be between {0} and {1}',
      length: 'Value must have a length of {0}',
      minlength: 'Value must be at least {0} characters long',
      maxlength: 'Value cannot be more that {0} characters long',
      rangelength: 'Value must be between {0} and {1} characters long',
      pattern: 'Please match the requested format',
      email: 'Please enter a valid email',
      url: 'Please enter a valid URL',
      numeric: 'Value must be numeric',
      alphanumeric: 'Value must contain letters and numbers only',
      alpha: 'Value must contain letters only'
    }
  });

  this.checkValidity = function (name) {
    var retVal = true;
    if (this.validation) {
      if (name) {
        return this.checkFieldValidity(name, this.validation[name]);
      } else {
        for (name in this.validation) {
          retVal = this.checkFieldValidity(name, this.validation[name]) && retVal;
        }
      }
    }
    return retVal;
  };

  this.checkFieldValidity = function (name, options) {
    var retVal = true, radios = [], radioValue, rule, node;
    var nodes = (this.ui && utils.has(this.ui, name)) ? [this.ui[name]] : this.select('[name="' + name +'"]');
    options = options || (this.validation ? this.validation[name] : {});

    if (nodes.length === 0) { return true; }

    var validate = utils.bind(function (rule, field, value, options) {
      if (rule === 'custom') {
        if (utils.isFunction(options)) {
          return options.call(this, node, value);
        } else {
          return this[options].call(this, node, value);
        }
      } else {
        return validators[rule].call(this, node, value, options);
      }
    }, this);

    for (var i = 0, l = nodes.length; i< l; i++) {
      node = nodes[i];
      utils.removeClassName(node, 'invalid');
      if (node.type === 'radio') {
        radios.push(node);
        radioValue = node.checked ? node.value : null;
      } else {
        for (rule in options) {
          if (validate(rule, node, node.value, options[rule])) {
            retVal = true && retVal;
          } else {
            retVal = false;
            break;
          }
        }
      }
    }

    if (radios.length > 0) {
      for (rule in options) {
        if (validate(rule, radios, radioValue, options[rule])) {
          retVal = true && retVal;
        } else {
          retVal = false;
          break;
        }
      }
    }

    if (retVal) {
      this.setValidity(nodes, true);
    }

    return retVal;
  };

  this.setValidity = function (field, msg, rule, options) {
    var nodes, node, e, retVal;
    if (this.ui && utils.has(this.ui, field)) {
      nodes = [this.ui[field]];
    } else if (utils.isString(field)) {
      nodes = [].slice.call(this.select('[name="' + field + '"]'));
    } else if (utils.isElement(field)) {
      nodes = [field];
    } else if (utils.isArray(field)) {
      nodes = field;
    } else {
      nodes = [].slice.call(field);
    }
    for (var i = 0, l = nodes.length; i < l; i++) {
      node = nodes[i];
      if (msg === true) {
        utils.removeClassName(node, 'invalid');
        utils.addClassName(node, 'valid');
        e = utils.createEvent('valid');
        retVal = true;
      } else {
        utils.addClassName(node, 'invalid');
        e = utils.createEvent('invalid', { message: msg, rule: rule, options: options });
        retVal = false;
      }
      node.dispatchEvent(e);
    }
    return retVal;
  };

  this.formatValidityMessage = function (msg, args) {
    args = !utils.isArray(args) ? [args] : args;
    return msg.replace(/{{([0-9]+)}}/g, function (str, p1) {
      return args[p1];
    });
  };
};

var validators = {
  required: function (field, value, options) {
    var msg = utils.has(options, 'message') ? options.message : this.validityMessages.required;
    if (options && ('undefined' === typeof value || value === null || utils.isEmpty(value))) {
      return this.setValidity(field, msg, 'required');
    }
    return true;
  },
  min: function (field, value, options) {
    if ('object' !== typeof options) {
      options = { min: options };
    }
    var msg = utils.has(options, 'message') ? options.message : this.validityMessages.min;
    if ('undefined' !== typeof value && value !== null && !utils.isEmpty(value) && value < options.min) {
      return this.setValidity(field, this.formatValidityMessage(msg, options.min), 'min');
    }
    return true;
  },
  max: function (field, value, options) {
    if ('object' !== typeof options) {
      options = { max: options };
    }
    var msg = utils.has(options, 'message') ? options.message : this.validityMessages.max;
    if ('undefined' !== typeof value && value !== null && !utils.isEmpty(value) && value > options.max) {
      return this.setValidity(field, this.formatValidityMessage(msg, options.max), 'max');
    }
    return true;
  },
  step: function (field, value, options) {
    if ('object' !== typeof options) {
      options = { step: options };
    }
    var msg = utils.has(options, 'message') ? options.message : this.validityMessages.step;
    if ('undefined' !== typeof value && value !== null && !utils.isEmpty(value) && (value % options.step !== 0)) {
      return this.setValidity(field, this.formatValidityMessage(msg, options.step), 'range');
    }
    return true;
  },
  range: function (field, value, options) {
    if (utils.isArray(options)) {
      options = { min: options[0], max: options[1] };
    }
    var msg = utils.has(options, 'message') ? options.message : this.validityMessages.range;
    if ('undefined' !== typeof value && value !== null && !utils.isEmpty(value) && (value < options.min || value > options.max)) {
      return this.setValidity(field, this.formatValidityMessage(msg, [options.min, options.max]), 'range');
    }
    return true;
  },
  length: function (field, value, options) {
    if ('object' !== typeof options) {
      options = { length: options };
    }
    var msg = utils.has(options, 'message') ? options.message : this.validityMessages.length;
    if ('undefined' !== typeof value && value !== null && !utils.isEmpty(value) && value.length !== options.length) {
      return this.setValidity(field, this.formatValidityMessage(msg, options.length), 'length');
    }
    return true;
  },
  minlength: function (field, value, options) {
    if ('object' !== typeof options) {
      options = { minlength: options };
    }
    var msg = utils.has(options, 'message') ? options.message : this.validityMessages.minlength;
    if ('undefined' !== typeof value && value !== null && !utils.isEmpty(value) && value.length < options.minlength) {
      return this.setValidity(field, this.formatValidityMessage(msg, options.minlength), 'minlength');
    }
    return true;
  },
  maxlength: function (field, value, options) {
    if ('object' !== typeof options) {
      options = { maxlength: options };
    }
    var msg = utils.has(options, 'message') ? options.message : this.validityMessages.maxlength;
    if ('undefined' !== typeof value && value !== null && !utils.isEmpty(value) && value.length > options.maxlength) {
      return this.setValidity(field, this.formatValidityMessage(msg, options.maxlength), 'maxlength');
    }
    return true;
  },
  rangelength: function (field, value, options) {
    if (utils.isArray(options)) {
      options = { min: options[0], max: options[1] };
    }
    var msg = utils.has(options, 'message') ? options.message : this.validityMessages.rangelength;
    if ('undefined' !== typeof value && value !== null && !utils.isEmpty(value) && (value.length < options.min || value.length > options.max)) {
      return this.setValidity(field, this.formatValidityMessage(msg, [options.min, options.max]), 'rangelength');
    }
    return true;
  },
  pattern: function (field, value, options) {
    if (utils.isString(options)) {
      options = { pattern: new RegExp(options) };
    } else if (options instanceof RegExp) {
      options = { pattern: options };
    }
    options.pattern = options.pattern instanceof RegExp ? options.pattern : new RegExp(options.pattern);
    var msg = utils.has(options, 'message') ? options.message : this.validityMessages.pattern;
    if ('undefined' !== typeof value && value !== null && !utils.isEmpty(value) && !options.pattern.test(value)) {
      return this.setValidity(field, this.formatValidityMessage(msg), 'pattern');
    }
    return true;
  },
  url: function (field, value, options) {
    if ('object' !== typeof options) {
      options = {
        schemes: ['http', 'https', 'ftp'],
        requireTld: true,
        requireScheme: false
      };
    }
    var msg = utils.has(options, 'message') ? options.message : this.validityMessages.url;
    var regex = new RegExp('^(?!mailto:)(?:(?:' + options.schemes.join('|') + ')://)' + (options.requireScheme ? '' : '?') + '(?:\\S+(?::\\S*)?@)?(?:(?:(?:[1-9]\\d?|1\\d\\d|2[01]\\d|22[0-3])(?:\\.(?:1?\\d{1,2}|2[0-4]\\d|25[0-5])){2}(?:\\.(?:[0-9]\\d?|1\\d\\d|2[0-4]\\d|25[0-4]))|(?:(?:[a-z\\u00a1-\\uffff0-9]+-?)*[a-z\\u00a1-\\uffff0-9]+)(?:\\.(?:[a-z\\u00a1-\\uffff0-9]+-?)*[a-z\\u00a1-\\uffff0-9]+)*(?:\\.(?:[a-z\\u00a1-\\uffff]{2,}))' + (options.requireTld ? '' : '?') + ')|localhost)(?::\\d{2,5})?(?:(/|\\?|#)[^\\s]*)?$', 'i');
    if ('undefined' !== typeof value && value !== null && !utils.isEmpty(value) && (value.length > 2083 || !regex.test(value))) {
      return this.setValidity(field, this.formatValidityMessage(msg), 'url');
    }
    return true;
  },
  email: function (field, value, options) {
    var regex = /^((([a-z]|\d|[!#\$%&'\*\+\-\/=\?\^_`{\|}~]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])+(\.([a-z]|\d|[!#\$%&'\*\+\-\/=\?\^_`{\|}~]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])+)*)|((\x22)((((\x20|\x09)*(\x0d\x0a))?(\x20|\x09)+)?(([\x01-\x08\x0b\x0c\x0e-\x1f\x7f]|\x21|[\x23-\x5b]|[\x5d-\x7e]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])|(\\([\x01-\x09\x0b\x0c\x0d-\x7f]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF]))))*(((\x20|\x09)*(\x0d\x0a))?(\x20|\x09)+)?(\x22)))@((([a-z]|\d|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])|(([a-z]|\d|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])([a-z]|\d|-|\.|_|~|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])*([a-z]|\d|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])))\.)+(([a-z]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])|(([a-z]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])([a-z]|\d|-|\.|_|~|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])*([a-z]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])))\.?$/i;
    if ('object' !== typeof options) {
      options = {};
    }
    var msg = utils.has(options, 'message') ? options.message : this.validityMessages.email;
    if ('undefined' !== typeof value && value !== null && !utils.isEmpty(value) && !regex.test(value)) {
      return this.setValidity(field, this.formatValidityMessage(msg), 'email');
    }
    return true;
  },
  numeric: function (field, value, options) {
    var regex = /^-?[0-9]+$/;
    if ('object' !== typeof options) {
      options = {};
    }
    var msg = utils.has(options, 'message') ? options.message : this.validityMessages.numeric;
    if ('undefined' !== typeof value && value !== null && !utils.isEmpty(value) && !regex.test(value)) {
      return this.setValidity(field, this.formatValidityMessage(msg), 'numeric');
    }
    return true;
  },
  alphanumeric: function (field, value, options) {
    var regex = /^[a-zA-Z0-9]+$/;
    if ('object' !== typeof options) {
      options = {};
    }
    var msg = utils.has(options, 'message') ? options.message : this.validityMessages.alphanumeric;
    if ('undefined' !== typeof value && value !== null && !utils.isEmpty(value) && !regex.test(value)) {
      return this.setValidity(field, this.formatValidityMessage(msg), 'alphanumeric');
    }
    return true;
  },
  alpha: function (field, value, options) {
    var regex = /^[a-zA-Z]+$/;
    if ('object' !== typeof options) {
      options = {};
    }
    var msg = utils.has(options, 'message') ? options.message : this.validityMessages.alpha;
    if ('undefined' !== typeof value && value !== null && !utils.isEmpty(value) && !regex.test(value)) {
      return this.setValidity(field, this.formatValidityMessage(msg), 'alpha');
    }
    return true;
  }
};
},{"../utils":12}],9:[function(_dereq_,module,exports){
var utils = _dereq_('../utils');

var View = function View () {
  var _templateCache = {};

  this.setupUI = function () {
    if (this.ui) {
      this._ui || ( this._ui = this.ui);
      var binding = utils.result(this, '_ui');
      this.ui = {};
      utils.forIn(binding, function (selector, key) {
        this.ui[key] = this.select(selector, true);
      }, this);
    }
  };

  this.teardownUI = function () {
    if (this.ui) {
      this._ui || ( this._ui = this.ui);
      var binding = utils.result(this, '_ui');
      utils.forIn(binding, function (selector, key) {
        delete this.ui[key];
      }, this);
    }
  };

  this.setupEvents = function () {
    if (this.events) {
      utils.forIn(this.events, function (func, event) {
        var el, type, parts = event.split(/[. ]+/, 2);
        if (parts.length === 1) {
          el = this.el;
          type = parts[0];
        } else {
          el = this.ui[parts[0]];
          type = parts[1];
        }
        this.listenTo(el, type, func);
      }, this);
    }
  };

  this.teardownEvents = function () {
    if (this.events) {
      utils.forIn(this.events, function (func, event) {
        var el, type, parts = event.split(/[. ]+/, 2);
        if (parts.length === 1) {
          el = this.el;
          type = parts[0];
        } else {
          el = this.ui[parts[0]];
          type = parts[1];
        }
        this.stopListening(el, type);
      }, this);
    }
  };

  if (!utils.has(this, 'render')) {
    this.render = function (data) {
      var html = '', el, source = '';
      if (this.template) {
        if (this._isRendered) {
          this.teardownEvents();
          this.teardownUI();
        }
        if (utils.isFunction(this.template)) {
          html = this.template(data);
        } else {
          if (utils.has(_templateCache, this.template)) {
            source = _templateCache[this.template];
          } else {
            el = window.document.querySelector(this.template);
            if (!el) { throw Error('template ' + this.template + ' not found'); }
            source = el.innerHTML;
            _templateCache[this.template] = source;
          }
          html = utils.template(source, data || {});
        }
        this.el.innerHTML = html;
        this.setupUI();
        this.setupEvents();
        this._isRendered = true;
      }
    };
  }

  this.remove = function () {
    this.el.parentNode.removeChild(this.el);
  };

  this.before('initialize', function () {
    if (this.el.children.length > 0) {
      this.setupUI();
      this.setupEvents();
    }
  });
};

module.exports = View;
},{"../utils":12}],10:[function(_dereq_,module,exports){
var utils = _dereq_('./utils');

var Registry = function () {
  this.components = {};
  this.instances = {};
  this.instancesAll = {};
};

Registry.prototype.addComponent = function (component) {
  var type = component.prototype.type;
  // if (this.components[type]) {
  //   throw new Error('a component with type ' + type + ' is already defined');
  // }
  this.components[type] = component;
};

Registry.prototype.addInstance = function (instance) {
  if (this.instancesAll[instance.id]) {
    throw new Error('an instance with id ' + instance.id + ' already exists');
  }
  this.instancesAll[instance.id] = instance;
  this.instances[instance.type] = this.instances[instance.type] || {};
  this.instances[instance.type][instance.id] = instance;
};

Registry.prototype.findComponent = function (type) {
  return this.components[type] || null;
};

Registry.prototype.findInstance = function (id) {
  return this.instancesAll[id] || null;
};

Registry.prototype.findInstancesOf = function (component) {
  var type = utils.isString(component) ? component : component.type;
  return utils.values(this.instances[type]) || null;
};

Registry.prototype.removeComponent = function (component) {
  var type = utils.isString(component) ? component : component.type;
  delete this.components[type];
};

Registry.prototype.removeInstance = function (instance) {
  var id = utils.isString(instance) ? instance : instance.id;
  instance = this.instancesAll[id];
  instance.destroy();
  delete this.instancesAll[id];
  delete this.instances[instance.type][id];
};

Registry.prototype.removeInstancesOf = function (component) {
  var type = utils.isString(component) ? component : component.type;
  var instances = this.instances[type];
  for (var id in instances) {
    this.instancesAll[id].destroy();
    delete this.instancesAll[id];
  }
  delete this.instances[type];
};

module.exports = new Registry();
},{"./utils":12}],11:[function(_dereq_,module,exports){
/* global _ */
if ('undefined' !== typeof _) {
  exports.omit = _.omit;
  exports.pick = _.pick;
  exports.has = _.has;
  exports.defaults = _.defaults;
  exports.clone = _.clone;
  exports.isEmpty = _.isEmpty;
  exports.isString = _.isString;
  exports.isArray = _.isArray;
  exports.isFunction = _.isFunction;
  exports.isElement = _.isElement;
  exports.forIn = _.forIn;
  exports.values = _.values;
  exports.create = _.create;
  exports.result = _.result;
  exports.uniqueId = _.uniqueId;
  exports.noop = _.noop;
  exports.template = _.template;
  exports.wrap = _.wrap;
  exports.bind = _.bind;
  exports.bindAll = _.bindAll;
  exports.defer = _.defer;
  exports.forEach = _.forEach;
  exports.map = _.map;
}
},{}],12:[function(_dereq_,module,exports){

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

exports.extend = _dereq_('lodash-node/modern/objects/assign');
exports.extend(exports, _dereq_('./utils-ext-global'));
exports.extend(exports, _dereq_('./utils-ext-require'));
},{"./utils-ext-global":11,"lodash-node/modern/objects/assign":24}],13:[function(_dereq_,module,exports){
/**
 * Lo-Dash 2.4.1 (Custom Build) <http://lodash.com/>
 * Build: `lodash modularize modern exports="node" -o ./modern/`
 * Copyright 2012-2013 The Dojo Foundation <http://dojofoundation.org/>
 * Based on Underscore.js 1.5.2 <http://underscorejs.org/LICENSE>
 * Copyright 2009-2013 Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
 * Available under MIT license <http://lodash.com/license>
 */
var createWrapper = _dereq_('../internals/createWrapper'),
    slice = _dereq_('../internals/slice');

/**
 * Creates a function that, when called, invokes `func` with the `this`
 * binding of `thisArg` and prepends any additional `bind` arguments to those
 * provided to the bound function.
 *
 * @static
 * @memberOf _
 * @category Functions
 * @param {Function} func The function to bind.
 * @param {*} [thisArg] The `this` binding of `func`.
 * @param {...*} [arg] Arguments to be partially applied.
 * @returns {Function} Returns the new bound function.
 * @example
 *
 * var func = function(greeting) {
 *   return greeting + ' ' + this.name;
 * };
 *
 * func = _.bind(func, { 'name': 'fred' }, 'hi');
 * func();
 * // => 'hi fred'
 */
function bind(func, thisArg) {
  return arguments.length > 2
    ? createWrapper(func, 17, slice(arguments, 2), null, thisArg)
    : createWrapper(func, 1, null, null, thisArg);
}

module.exports = bind;

},{"../internals/createWrapper":18,"../internals/slice":23}],14:[function(_dereq_,module,exports){
/**
 * Lo-Dash 2.4.1 (Custom Build) <http://lodash.com/>
 * Build: `lodash modularize modern exports="node" -o ./modern/`
 * Copyright 2012-2013 The Dojo Foundation <http://dojofoundation.org/>
 * Based on Underscore.js 1.5.2 <http://underscorejs.org/LICENSE>
 * Copyright 2009-2013 Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
 * Available under MIT license <http://lodash.com/license>
 */
var baseCreate = _dereq_('./baseCreate'),
    isObject = _dereq_('../objects/isObject'),
    setBindData = _dereq_('./setBindData'),
    slice = _dereq_('./slice');

/**
 * Used for `Array` method references.
 *
 * Normally `Array.prototype` would suffice, however, using an array literal
 * avoids issues in Narwhal.
 */
var arrayRef = [];

/** Native method shortcuts */
var push = arrayRef.push;

/**
 * The base implementation of `_.bind` that creates the bound function and
 * sets its meta data.
 *
 * @private
 * @param {Array} bindData The bind data array.
 * @returns {Function} Returns the new bound function.
 */
function baseBind(bindData) {
  var func = bindData[0],
      partialArgs = bindData[2],
      thisArg = bindData[4];

  function bound() {
    // `Function#bind` spec
    // http://es5.github.io/#x15.3.4.5
    if (partialArgs) {
      // avoid `arguments` object deoptimizations by using `slice` instead
      // of `Array.prototype.slice.call` and not assigning `arguments` to a
      // variable as a ternary expression
      var args = slice(partialArgs);
      push.apply(args, arguments);
    }
    // mimic the constructor's `return` behavior
    // http://es5.github.io/#x13.2.2
    if (this instanceof bound) {
      // ensure `new bound` is an instance of `func`
      var thisBinding = baseCreate(func.prototype),
          result = func.apply(thisBinding, args || arguments);
      return isObject(result) ? result : thisBinding;
    }
    return func.apply(thisArg, args || arguments);
  }
  setBindData(bound, bindData);
  return bound;
}

module.exports = baseBind;

},{"../objects/isObject":26,"./baseCreate":15,"./setBindData":21,"./slice":23}],15:[function(_dereq_,module,exports){
(function (global){
/**
 * Lo-Dash 2.4.1 (Custom Build) <http://lodash.com/>
 * Build: `lodash modularize modern exports="node" -o ./modern/`
 * Copyright 2012-2013 The Dojo Foundation <http://dojofoundation.org/>
 * Based on Underscore.js 1.5.2 <http://underscorejs.org/LICENSE>
 * Copyright 2009-2013 Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
 * Available under MIT license <http://lodash.com/license>
 */
var isNative = _dereq_('./isNative'),
    isObject = _dereq_('../objects/isObject'),
    noop = _dereq_('../utilities/noop');

/* Native method shortcuts for methods with the same name as other `lodash` methods */
var nativeCreate = isNative(nativeCreate = Object.create) && nativeCreate;

/**
 * The base implementation of `_.create` without support for assigning
 * properties to the created object.
 *
 * @private
 * @param {Object} prototype The object to inherit from.
 * @returns {Object} Returns the new object.
 */
function baseCreate(prototype, properties) {
  return isObject(prototype) ? nativeCreate(prototype) : {};
}
// fallback for browsers without `Object.create`
if (!nativeCreate) {
  baseCreate = (function() {
    function Object() {}
    return function(prototype) {
      if (isObject(prototype)) {
        Object.prototype = prototype;
        var result = new Object;
        Object.prototype = null;
      }
      return result || global.Object();
    };
  }());
}

module.exports = baseCreate;

}).call(this,typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"../objects/isObject":26,"../utilities/noop":30,"./isNative":19}],16:[function(_dereq_,module,exports){
/**
 * Lo-Dash 2.4.1 (Custom Build) <http://lodash.com/>
 * Build: `lodash modularize modern exports="node" -o ./modern/`
 * Copyright 2012-2013 The Dojo Foundation <http://dojofoundation.org/>
 * Based on Underscore.js 1.5.2 <http://underscorejs.org/LICENSE>
 * Copyright 2009-2013 Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
 * Available under MIT license <http://lodash.com/license>
 */
var bind = _dereq_('../functions/bind'),
    identity = _dereq_('../utilities/identity'),
    setBindData = _dereq_('./setBindData'),
    support = _dereq_('../support');

/** Used to detected named functions */
var reFuncName = /^\s*function[ \n\r\t]+\w/;

/** Used to detect functions containing a `this` reference */
var reThis = /\bthis\b/;

/** Native method shortcuts */
var fnToString = Function.prototype.toString;

/**
 * The base implementation of `_.createCallback` without support for creating
 * "_.pluck" or "_.where" style callbacks.
 *
 * @private
 * @param {*} [func=identity] The value to convert to a callback.
 * @param {*} [thisArg] The `this` binding of the created callback.
 * @param {number} [argCount] The number of arguments the callback accepts.
 * @returns {Function} Returns a callback function.
 */
function baseCreateCallback(func, thisArg, argCount) {
  if (typeof func != 'function') {
    return identity;
  }
  // exit early for no `thisArg` or already bound by `Function#bind`
  if (typeof thisArg == 'undefined' || !('prototype' in func)) {
    return func;
  }
  var bindData = func.__bindData__;
  if (typeof bindData == 'undefined') {
    if (support.funcNames) {
      bindData = !func.name;
    }
    bindData = bindData || !support.funcDecomp;
    if (!bindData) {
      var source = fnToString.call(func);
      if (!support.funcNames) {
        bindData = !reFuncName.test(source);
      }
      if (!bindData) {
        // checks if `func` references the `this` keyword and stores the result
        bindData = reThis.test(source);
        setBindData(func, bindData);
      }
    }
  }
  // exit early if there are no `this` references or `func` is bound
  if (bindData === false || (bindData !== true && bindData[1] & 1)) {
    return func;
  }
  switch (argCount) {
    case 1: return function(value) {
      return func.call(thisArg, value);
    };
    case 2: return function(a, b) {
      return func.call(thisArg, a, b);
    };
    case 3: return function(value, index, collection) {
      return func.call(thisArg, value, index, collection);
    };
    case 4: return function(accumulator, value, index, collection) {
      return func.call(thisArg, accumulator, value, index, collection);
    };
  }
  return bind(func, thisArg);
}

module.exports = baseCreateCallback;

},{"../functions/bind":13,"../support":28,"../utilities/identity":29,"./setBindData":21}],17:[function(_dereq_,module,exports){
/**
 * Lo-Dash 2.4.1 (Custom Build) <http://lodash.com/>
 * Build: `lodash modularize modern exports="node" -o ./modern/`
 * Copyright 2012-2013 The Dojo Foundation <http://dojofoundation.org/>
 * Based on Underscore.js 1.5.2 <http://underscorejs.org/LICENSE>
 * Copyright 2009-2013 Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
 * Available under MIT license <http://lodash.com/license>
 */
var baseCreate = _dereq_('./baseCreate'),
    isObject = _dereq_('../objects/isObject'),
    setBindData = _dereq_('./setBindData'),
    slice = _dereq_('./slice');

/**
 * Used for `Array` method references.
 *
 * Normally `Array.prototype` would suffice, however, using an array literal
 * avoids issues in Narwhal.
 */
var arrayRef = [];

/** Native method shortcuts */
var push = arrayRef.push;

/**
 * The base implementation of `createWrapper` that creates the wrapper and
 * sets its meta data.
 *
 * @private
 * @param {Array} bindData The bind data array.
 * @returns {Function} Returns the new function.
 */
function baseCreateWrapper(bindData) {
  var func = bindData[0],
      bitmask = bindData[1],
      partialArgs = bindData[2],
      partialRightArgs = bindData[3],
      thisArg = bindData[4],
      arity = bindData[5];

  var isBind = bitmask & 1,
      isBindKey = bitmask & 2,
      isCurry = bitmask & 4,
      isCurryBound = bitmask & 8,
      key = func;

  function bound() {
    var thisBinding = isBind ? thisArg : this;
    if (partialArgs) {
      var args = slice(partialArgs);
      push.apply(args, arguments);
    }
    if (partialRightArgs || isCurry) {
      args || (args = slice(arguments));
      if (partialRightArgs) {
        push.apply(args, partialRightArgs);
      }
      if (isCurry && args.length < arity) {
        bitmask |= 16 & ~32;
        return baseCreateWrapper([func, (isCurryBound ? bitmask : bitmask & ~3), args, null, thisArg, arity]);
      }
    }
    args || (args = arguments);
    if (isBindKey) {
      func = thisBinding[key];
    }
    if (this instanceof bound) {
      thisBinding = baseCreate(func.prototype);
      var result = func.apply(thisBinding, args);
      return isObject(result) ? result : thisBinding;
    }
    return func.apply(thisBinding, args);
  }
  setBindData(bound, bindData);
  return bound;
}

module.exports = baseCreateWrapper;

},{"../objects/isObject":26,"./baseCreate":15,"./setBindData":21,"./slice":23}],18:[function(_dereq_,module,exports){
/**
 * Lo-Dash 2.4.1 (Custom Build) <http://lodash.com/>
 * Build: `lodash modularize modern exports="node" -o ./modern/`
 * Copyright 2012-2013 The Dojo Foundation <http://dojofoundation.org/>
 * Based on Underscore.js 1.5.2 <http://underscorejs.org/LICENSE>
 * Copyright 2009-2013 Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
 * Available under MIT license <http://lodash.com/license>
 */
var baseBind = _dereq_('./baseBind'),
    baseCreateWrapper = _dereq_('./baseCreateWrapper'),
    isFunction = _dereq_('../objects/isFunction'),
    slice = _dereq_('./slice');

/**
 * Used for `Array` method references.
 *
 * Normally `Array.prototype` would suffice, however, using an array literal
 * avoids issues in Narwhal.
 */
var arrayRef = [];

/** Native method shortcuts */
var push = arrayRef.push,
    unshift = arrayRef.unshift;

/**
 * Creates a function that, when called, either curries or invokes `func`
 * with an optional `this` binding and partially applied arguments.
 *
 * @private
 * @param {Function|string} func The function or method name to reference.
 * @param {number} bitmask The bitmask of method flags to compose.
 *  The bitmask may be composed of the following flags:
 *  1 - `_.bind`
 *  2 - `_.bindKey`
 *  4 - `_.curry`
 *  8 - `_.curry` (bound)
 *  16 - `_.partial`
 *  32 - `_.partialRight`
 * @param {Array} [partialArgs] An array of arguments to prepend to those
 *  provided to the new function.
 * @param {Array} [partialRightArgs] An array of arguments to append to those
 *  provided to the new function.
 * @param {*} [thisArg] The `this` binding of `func`.
 * @param {number} [arity] The arity of `func`.
 * @returns {Function} Returns the new function.
 */
function createWrapper(func, bitmask, partialArgs, partialRightArgs, thisArg, arity) {
  var isBind = bitmask & 1,
      isBindKey = bitmask & 2,
      isCurry = bitmask & 4,
      isCurryBound = bitmask & 8,
      isPartial = bitmask & 16,
      isPartialRight = bitmask & 32;

  if (!isBindKey && !isFunction(func)) {
    throw new TypeError;
  }
  if (isPartial && !partialArgs.length) {
    bitmask &= ~16;
    isPartial = partialArgs = false;
  }
  if (isPartialRight && !partialRightArgs.length) {
    bitmask &= ~32;
    isPartialRight = partialRightArgs = false;
  }
  var bindData = func && func.__bindData__;
  if (bindData && bindData !== true) {
    // clone `bindData`
    bindData = slice(bindData);
    if (bindData[2]) {
      bindData[2] = slice(bindData[2]);
    }
    if (bindData[3]) {
      bindData[3] = slice(bindData[3]);
    }
    // set `thisBinding` is not previously bound
    if (isBind && !(bindData[1] & 1)) {
      bindData[4] = thisArg;
    }
    // set if previously bound but not currently (subsequent curried functions)
    if (!isBind && bindData[1] & 1) {
      bitmask |= 8;
    }
    // set curried arity if not yet set
    if (isCurry && !(bindData[1] & 4)) {
      bindData[5] = arity;
    }
    // append partial left arguments
    if (isPartial) {
      push.apply(bindData[2] || (bindData[2] = []), partialArgs);
    }
    // append partial right arguments
    if (isPartialRight) {
      unshift.apply(bindData[3] || (bindData[3] = []), partialRightArgs);
    }
    // merge flags
    bindData[1] |= bitmask;
    return createWrapper.apply(null, bindData);
  }
  // fast path for `_.bind`
  var creater = (bitmask == 1 || bitmask === 17) ? baseBind : baseCreateWrapper;
  return creater([func, bitmask, partialArgs, partialRightArgs, thisArg, arity]);
}

module.exports = createWrapper;

},{"../objects/isFunction":25,"./baseBind":14,"./baseCreateWrapper":17,"./slice":23}],19:[function(_dereq_,module,exports){
/**
 * Lo-Dash 2.4.1 (Custom Build) <http://lodash.com/>
 * Build: `lodash modularize modern exports="node" -o ./modern/`
 * Copyright 2012-2013 The Dojo Foundation <http://dojofoundation.org/>
 * Based on Underscore.js 1.5.2 <http://underscorejs.org/LICENSE>
 * Copyright 2009-2013 Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
 * Available under MIT license <http://lodash.com/license>
 */

/** Used for native method references */
var objectProto = Object.prototype;

/** Used to resolve the internal [[Class]] of values */
var toString = objectProto.toString;

/** Used to detect if a method is native */
var reNative = RegExp('^' +
  String(toString)
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    .replace(/toString| for [^\]]+/g, '.*?') + '$'
);

/**
 * Checks if `value` is a native function.
 *
 * @private
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if the `value` is a native function, else `false`.
 */
function isNative(value) {
  return typeof value == 'function' && reNative.test(value);
}

module.exports = isNative;

},{}],20:[function(_dereq_,module,exports){
/**
 * Lo-Dash 2.4.1 (Custom Build) <http://lodash.com/>
 * Build: `lodash modularize modern exports="node" -o ./modern/`
 * Copyright 2012-2013 The Dojo Foundation <http://dojofoundation.org/>
 * Based on Underscore.js 1.5.2 <http://underscorejs.org/LICENSE>
 * Copyright 2009-2013 Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
 * Available under MIT license <http://lodash.com/license>
 */

/** Used to determine if values are of the language type Object */
var objectTypes = {
  'boolean': false,
  'function': true,
  'object': true,
  'number': false,
  'string': false,
  'undefined': false
};

module.exports = objectTypes;

},{}],21:[function(_dereq_,module,exports){
/**
 * Lo-Dash 2.4.1 (Custom Build) <http://lodash.com/>
 * Build: `lodash modularize modern exports="node" -o ./modern/`
 * Copyright 2012-2013 The Dojo Foundation <http://dojofoundation.org/>
 * Based on Underscore.js 1.5.2 <http://underscorejs.org/LICENSE>
 * Copyright 2009-2013 Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
 * Available under MIT license <http://lodash.com/license>
 */
var isNative = _dereq_('./isNative'),
    noop = _dereq_('../utilities/noop');

/** Used as the property descriptor for `__bindData__` */
var descriptor = {
  'configurable': false,
  'enumerable': false,
  'value': null,
  'writable': false
};

/** Used to set meta data on functions */
var defineProperty = (function() {
  // IE 8 only accepts DOM elements
  try {
    var o = {},
        func = isNative(func = Object.defineProperty) && func,
        result = func(o, o, o) && func;
  } catch(e) { }
  return result;
}());

/**
 * Sets `this` binding data on a given function.
 *
 * @private
 * @param {Function} func The function to set data on.
 * @param {Array} value The data array to set.
 */
var setBindData = !defineProperty ? noop : function(func, value) {
  descriptor.value = value;
  defineProperty(func, '__bindData__', descriptor);
};

module.exports = setBindData;

},{"../utilities/noop":30,"./isNative":19}],22:[function(_dereq_,module,exports){
/**
 * Lo-Dash 2.4.1 (Custom Build) <http://lodash.com/>
 * Build: `lodash modularize modern exports="node" -o ./modern/`
 * Copyright 2012-2013 The Dojo Foundation <http://dojofoundation.org/>
 * Based on Underscore.js 1.5.2 <http://underscorejs.org/LICENSE>
 * Copyright 2009-2013 Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
 * Available under MIT license <http://lodash.com/license>
 */
var objectTypes = _dereq_('./objectTypes');

/** Used for native method references */
var objectProto = Object.prototype;

/** Native method shortcuts */
var hasOwnProperty = objectProto.hasOwnProperty;

/**
 * A fallback implementation of `Object.keys` which produces an array of the
 * given object's own enumerable property names.
 *
 * @private
 * @type Function
 * @param {Object} object The object to inspect.
 * @returns {Array} Returns an array of property names.
 */
var shimKeys = function(object) {
  var index, iterable = object, result = [];
  if (!iterable) return result;
  if (!(objectTypes[typeof object])) return result;
    for (index in iterable) {
      if (hasOwnProperty.call(iterable, index)) {
        result.push(index);
      }
    }
  return result
};

module.exports = shimKeys;

},{"./objectTypes":20}],23:[function(_dereq_,module,exports){
/**
 * Lo-Dash 2.4.1 (Custom Build) <http://lodash.com/>
 * Build: `lodash modularize modern exports="node" -o ./modern/`
 * Copyright 2012-2013 The Dojo Foundation <http://dojofoundation.org/>
 * Based on Underscore.js 1.5.2 <http://underscorejs.org/LICENSE>
 * Copyright 2009-2013 Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
 * Available under MIT license <http://lodash.com/license>
 */

/**
 * Slices the `collection` from the `start` index up to, but not including,
 * the `end` index.
 *
 * Note: This function is used instead of `Array#slice` to support node lists
 * in IE < 9 and to ensure dense arrays are returned.
 *
 * @private
 * @param {Array|Object|string} collection The collection to slice.
 * @param {number} start The start index.
 * @param {number} end The end index.
 * @returns {Array} Returns the new array.
 */
function slice(array, start, end) {
  start || (start = 0);
  if (typeof end == 'undefined') {
    end = array ? array.length : 0;
  }
  var index = -1,
      length = end - start || 0,
      result = Array(length < 0 ? 0 : length);

  while (++index < length) {
    result[index] = array[start + index];
  }
  return result;
}

module.exports = slice;

},{}],24:[function(_dereq_,module,exports){
/**
 * Lo-Dash 2.4.1 (Custom Build) <http://lodash.com/>
 * Build: `lodash modularize modern exports="node" -o ./modern/`
 * Copyright 2012-2013 The Dojo Foundation <http://dojofoundation.org/>
 * Based on Underscore.js 1.5.2 <http://underscorejs.org/LICENSE>
 * Copyright 2009-2013 Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
 * Available under MIT license <http://lodash.com/license>
 */
var baseCreateCallback = _dereq_('../internals/baseCreateCallback'),
    keys = _dereq_('./keys'),
    objectTypes = _dereq_('../internals/objectTypes');

/**
 * Assigns own enumerable properties of source object(s) to the destination
 * object. Subsequent sources will overwrite property assignments of previous
 * sources. If a callback is provided it will be executed to produce the
 * assigned values. The callback is bound to `thisArg` and invoked with two
 * arguments; (objectValue, sourceValue).
 *
 * @static
 * @memberOf _
 * @type Function
 * @alias extend
 * @category Objects
 * @param {Object} object The destination object.
 * @param {...Object} [source] The source objects.
 * @param {Function} [callback] The function to customize assigning values.
 * @param {*} [thisArg] The `this` binding of `callback`.
 * @returns {Object} Returns the destination object.
 * @example
 *
 * _.assign({ 'name': 'fred' }, { 'employer': 'slate' });
 * // => { 'name': 'fred', 'employer': 'slate' }
 *
 * var defaults = _.partialRight(_.assign, function(a, b) {
 *   return typeof a == 'undefined' ? b : a;
 * });
 *
 * var object = { 'name': 'barney' };
 * defaults(object, { 'name': 'fred', 'employer': 'slate' });
 * // => { 'name': 'barney', 'employer': 'slate' }
 */
var assign = function(object, source, guard) {
  var index, iterable = object, result = iterable;
  if (!iterable) return result;
  var args = arguments,
      argsIndex = 0,
      argsLength = typeof guard == 'number' ? 2 : args.length;
  if (argsLength > 3 && typeof args[argsLength - 2] == 'function') {
    var callback = baseCreateCallback(args[--argsLength - 1], args[argsLength--], 2);
  } else if (argsLength > 2 && typeof args[argsLength - 1] == 'function') {
    callback = args[--argsLength];
  }
  while (++argsIndex < argsLength) {
    iterable = args[argsIndex];
    if (iterable && objectTypes[typeof iterable]) {
    var ownIndex = -1,
        ownProps = objectTypes[typeof iterable] && keys(iterable),
        length = ownProps ? ownProps.length : 0;

    while (++ownIndex < length) {
      index = ownProps[ownIndex];
      result[index] = callback ? callback(result[index], iterable[index]) : iterable[index];
    }
    }
  }
  return result
};

module.exports = assign;

},{"../internals/baseCreateCallback":16,"../internals/objectTypes":20,"./keys":27}],25:[function(_dereq_,module,exports){
/**
 * Lo-Dash 2.4.1 (Custom Build) <http://lodash.com/>
 * Build: `lodash modularize modern exports="node" -o ./modern/`
 * Copyright 2012-2013 The Dojo Foundation <http://dojofoundation.org/>
 * Based on Underscore.js 1.5.2 <http://underscorejs.org/LICENSE>
 * Copyright 2009-2013 Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
 * Available under MIT license <http://lodash.com/license>
 */

/**
 * Checks if `value` is a function.
 *
 * @static
 * @memberOf _
 * @category Objects
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if the `value` is a function, else `false`.
 * @example
 *
 * _.isFunction(_);
 * // => true
 */
function isFunction(value) {
  return typeof value == 'function';
}

module.exports = isFunction;

},{}],26:[function(_dereq_,module,exports){
/**
 * Lo-Dash 2.4.1 (Custom Build) <http://lodash.com/>
 * Build: `lodash modularize modern exports="node" -o ./modern/`
 * Copyright 2012-2013 The Dojo Foundation <http://dojofoundation.org/>
 * Based on Underscore.js 1.5.2 <http://underscorejs.org/LICENSE>
 * Copyright 2009-2013 Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
 * Available under MIT license <http://lodash.com/license>
 */
var objectTypes = _dereq_('../internals/objectTypes');

/**
 * Checks if `value` is the language type of Object.
 * (e.g. arrays, functions, objects, regexes, `new Number(0)`, and `new String('')`)
 *
 * @static
 * @memberOf _
 * @category Objects
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if the `value` is an object, else `false`.
 * @example
 *
 * _.isObject({});
 * // => true
 *
 * _.isObject([1, 2, 3]);
 * // => true
 *
 * _.isObject(1);
 * // => false
 */
function isObject(value) {
  // check if the value is the ECMAScript language type of Object
  // http://es5.github.io/#x8
  // and avoid a V8 bug
  // http://code.google.com/p/v8/issues/detail?id=2291
  return !!(value && objectTypes[typeof value]);
}

module.exports = isObject;

},{"../internals/objectTypes":20}],27:[function(_dereq_,module,exports){
/**
 * Lo-Dash 2.4.1 (Custom Build) <http://lodash.com/>
 * Build: `lodash modularize modern exports="node" -o ./modern/`
 * Copyright 2012-2013 The Dojo Foundation <http://dojofoundation.org/>
 * Based on Underscore.js 1.5.2 <http://underscorejs.org/LICENSE>
 * Copyright 2009-2013 Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
 * Available under MIT license <http://lodash.com/license>
 */
var isNative = _dereq_('../internals/isNative'),
    isObject = _dereq_('./isObject'),
    shimKeys = _dereq_('../internals/shimKeys');

/* Native method shortcuts for methods with the same name as other `lodash` methods */
var nativeKeys = isNative(nativeKeys = Object.keys) && nativeKeys;

/**
 * Creates an array composed of the own enumerable property names of an object.
 *
 * @static
 * @memberOf _
 * @category Objects
 * @param {Object} object The object to inspect.
 * @returns {Array} Returns an array of property names.
 * @example
 *
 * _.keys({ 'one': 1, 'two': 2, 'three': 3 });
 * // => ['one', 'two', 'three'] (property order is not guaranteed across environments)
 */
var keys = !nativeKeys ? shimKeys : function(object) {
  if (!isObject(object)) {
    return [];
  }
  return nativeKeys(object);
};

module.exports = keys;

},{"../internals/isNative":19,"../internals/shimKeys":22,"./isObject":26}],28:[function(_dereq_,module,exports){
(function (global){
/**
 * Lo-Dash 2.4.1 (Custom Build) <http://lodash.com/>
 * Build: `lodash modularize modern exports="node" -o ./modern/`
 * Copyright 2012-2013 The Dojo Foundation <http://dojofoundation.org/>
 * Based on Underscore.js 1.5.2 <http://underscorejs.org/LICENSE>
 * Copyright 2009-2013 Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
 * Available under MIT license <http://lodash.com/license>
 */
var isNative = _dereq_('./internals/isNative');

/** Used to detect functions containing a `this` reference */
var reThis = /\bthis\b/;

/**
 * An object used to flag environments features.
 *
 * @static
 * @memberOf _
 * @type Object
 */
var support = {};

/**
 * Detect if functions can be decompiled by `Function#toString`
 * (all but PS3 and older Opera mobile browsers & avoided in Windows 8 apps).
 *
 * @memberOf _.support
 * @type boolean
 */
support.funcDecomp = !isNative(global.WinRTError) && reThis.test(function() { return this; });

/**
 * Detect if `Function#name` is supported (all but IE).
 *
 * @memberOf _.support
 * @type boolean
 */
support.funcNames = typeof Function.name == 'string';

module.exports = support;

}).call(this,typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"./internals/isNative":19}],29:[function(_dereq_,module,exports){
/**
 * Lo-Dash 2.4.1 (Custom Build) <http://lodash.com/>
 * Build: `lodash modularize modern exports="node" -o ./modern/`
 * Copyright 2012-2013 The Dojo Foundation <http://dojofoundation.org/>
 * Based on Underscore.js 1.5.2 <http://underscorejs.org/LICENSE>
 * Copyright 2009-2013 Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
 * Available under MIT license <http://lodash.com/license>
 */

/**
 * This method returns the first argument provided to it.
 *
 * @static
 * @memberOf _
 * @category Utilities
 * @param {*} value Any value.
 * @returns {*} Returns `value`.
 * @example
 *
 * var object = { 'name': 'fred' };
 * _.identity(object) === object;
 * // => true
 */
function identity(value) {
  return value;
}

module.exports = identity;

},{}],30:[function(_dereq_,module,exports){
/**
 * Lo-Dash 2.4.1 (Custom Build) <http://lodash.com/>
 * Build: `lodash modularize modern exports="node" -o ./modern/`
 * Copyright 2012-2013 The Dojo Foundation <http://dojofoundation.org/>
 * Based on Underscore.js 1.5.2 <http://underscorejs.org/LICENSE>
 * Copyright 2009-2013 Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
 * Available under MIT license <http://lodash.com/license>
 */

/**
 * A no-operation function.
 *
 * @static
 * @memberOf _
 * @category Utilities
 * @example
 *
 * var object = { 'name': 'fred' };
 * _.noop(object) === undefined;
 * // => true
 */
function noop() {
  // no operation performed
}

module.exports = noop;

},{}]},{},[2])
(2)
});