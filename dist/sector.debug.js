/**
 * sector v0.1.3
 * A component and pub/sub based UI library for javascript applications.
 * https://github.com/acdaniel/sector
 *
 * Copyright 2014 Adam Daniel <adam@acdaniel.com>
 * Released under the MIT license
 *
 * Date: 2014-03-17T14:26:51.211Z
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

Component.prototype.defaults = {};

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
  var self = this, instance, elements;
  options = options || {};
  elements = utils.isString(selector) ? utils.select(selector) : [selector];
  for (var i = 0, l = elements.length; i < l; i++) {
    options.el = elements[i];
    options.id = options.id || elements[i].id;
    instance = new self(options);
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
},{"./mixins/hooked":4,"./mixins/listener":5,"./mixins/pubsub":6,"./mixins/traceable":7,"./registry":9,"./utils":12}],2:[function(_dereq_,module,exports){
/*
 * inspiration and some code borrowed from
 * http://krasimirtsonev.com/blog/article/A-modern-JavaScript-router-in-100-lines-history-api-pushState-hash-url
 * and from Backbone.Router https://github.com/jashkenas/backbone
 */

var Component = _dereq_('../component'),
    utils = _dereq_('../utils');

var optionalParam = /\((.*?)\)/g;
var namedParam    = /(\(\?)?:\w+/g;
var splatParam    = /\*\w+/g;
var escapeRegExp  = /[\-{}\[\]+?.,\\\^$|#\s]/g;

var Router = Component.define({
  type: 'router',
  defaults: {
    mode: 'history',
    root: '/',
    routeTopic: 'ui.routeChanged',
    backRequestTopic: 'ui.navigateBackRequested',
    forwardRequestTopic: 'ui.navigateForwardRequested',
    navigateRequestTopic: 'ui.navigateRequested',
    uiReadyTopic: 'ui.ready'
  },
  initialize: function (options) {
    if (!history.pushState) { this.mode = 'hash'; }
    if (this.root !== '/') {
      this.root = '/' + this._clearSlashes(options.root) + '/';
    }
    this.routes = {};
    if (options.routes) {
      for (var name in options.routes) {
        this.addRoute(name, options.routes[name]);
      }
    }
    this.subscribe(this.navigateRequestTopic, this._handleNavigateRequest);
    this.subscribe(this.backRequestTopic, this._handleBackRequest);
    this.subscribe(this.forwardRequestTopic, this._handleForwardRequest);
    this.listenTo(window, 'hashchange', this._handleHashChange);
    this.subscribe(this.uiReadyTopic, function () {
      var msg = this._parseFragment(this.getFragment());
      this.publish(this.routeTopic, msg);
    });
  },
  addRoute: function (name, route) {
    route = route.replace(escapeRegExp, '\\$&')
      .replace(optionalParam, '(?:$1)?')
      .replace(namedParam, function(match, optional) {
        return optional ? match : '([^/?]+)';
      })
      .replace(splatParam, '([^?]*?)');
    var regex = new RegExp('^' + route + '(?:\\?([\\s\\S]*))?$');
    this.trace('adding named route: ' + name, regex);
    this.routes[name] = regex;
  },
  getFragment: function () {
    var fragment = '', match;
    if (this.mode === 'history') {
      fragment = this._clearSlashes(decodeURI(location.pathname + location.search));
      fragment = fragment.replace(/\?(.*)$/, '');
      fragment = this.root !== '/' ? fragment.replace(this.root, '') : fragment;
    } else {
      match = window.location.href.match(/#(.*)$/);
      fragment = match ? match[1] : '';
    }
    return fragment;
  },
  _parseFragment: function (fragment) {
    this.trace('parsing fragment ' + fragment);
    for (var name in this.routes) {
      var route = this.routes[name];
      this.trace('eval route ' + name, route);
      var params = route.exec(fragment);
      if (params) {
        params = params.slice(1);
        return {
          name: name,
          path: fragment,
          params: utils.map(params, function(param, i) {
            // Don't decode the search params.
            if (i === params.length - 1) { return param || null; }
            return param ? decodeURIComponent(param) : null;
          })
        };
      }
    }
    return {};
  },
  _clearSlashes: function(path) {
    return path.toString().replace(/\/$/, '').replace(/^\//, '');
  },
  _handleHashChange: function () {
    var fragment, msg;
    fragment = this.getFragment();
    msg = this._parseFragment(fragment);
    this.publish(this.routeTopic, msg);
  },
  _handleNavigateRequest: function (msg) {
    var path = msg.data ? msg.data : '';
    if(this.mode === 'history') {
      history.pushState(null, null, this.root + this._clearSlashes(path));
    } else {
      window.location.href.match(/#(.*)$/);
      window.location.href = window.location.href.replace(/#(.*)$/, '') + '#' + path;
    }
    var outMsg = this._parseFragment(path);
    this.publish(this.routeTopic, outMsg);
  },
  _handleBackRequest: function () {
    var fragment, msg;
    window.history.back();
    fragment = this.getFragment();
    msg = this._parseFragment(fragment);
    this.publish(this.routeTopic, msg);
  },
  _handleForwardRequest: function () {
    var fragment, msg;
    window.history.forward();
    fragment = this.getFragment();
    msg = this._parseFragment(fragment);
    this.publish(this.routeTopic, msg);
  }
});

module.exports = Router;
},{"../component":1,"../utils":12}],3:[function(_dereq_,module,exports){
// Sector.js
// =========

// Exports the core mixins.
exports.mixins = {
  Hooked: _dereq_('./mixins/hooked'),
  Traceable: _dereq_('./mixins/traceable'),
  Listener: _dereq_('./mixins/listener'),
  PubSub: _dereq_('./mixins/pubsub'),
  View: _dereq_('./mixins/view')
};

// Exports the included components.
exports.components = {
  Router: _dereq_('./components/router')
};

// Exports for common utilities.
exports.utils = _dereq_('./utils');

// Export Component class, the basis for everything.
exports.Component = _dereq_('./component');

// Exports component registry instance.
exports.registry = _dereq_('./registry');

// The **init** function looks for any elements in the DOM with a *data-component*
// attribute. It then uses the attributes value to lookup a component registered
// with the same type and the *data-options* attr, a JSON serialized value or options,
// or the *data-options-** attrs to create a new instance of the component attached to
// the element. For example:
//
//     <div id="hello" data-component="hello-world" data-options-debug="true">
//     </div>
//
// Will create a new instance of the *hello-world* component with an ID of "hello"
// and the debug option set to *true*
//
// This function will publish a <code>ui.ready</code> message when all
// components have been initialized.
exports.init = function (root, options) {
  if (!options) {
    options = root;
    root = document;
  }
  root = root || document;
  options = options || {};
  exports.utils.defaults(options, {
    componentSelector: '[data-component]',
    componentAttribute: 'data-component',
    optionsAttribute: 'data-options',
    optionsAttrPrefix: 'data-options-'
  });
  exports.utils.documentReady(function () {
    var nodes = [].slice.call(root.querySelectorAll(options.componentSelector));
    nodes.forEach(function (node) {
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
      component.attachTo(el, componentOptions);
    });
    var e = exports.utils.createEvent('pubsub.ui.ready',
      { topic: 'ui.ready', data: {} }
    );
    window.document.dispatchEvent(e);
  });
};
},{"./component":1,"./components/router":2,"./mixins/hooked":4,"./mixins/listener":5,"./mixins/pubsub":6,"./mixins/traceable":7,"./mixins/view":8,"./registry":9,"./utils":12}],4:[function(_dereq_,module,exports){

module.exports = function () {
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
    this[method] = utils.wrap(oFunc, wrapFunc);
  };
};
},{}],5:[function(_dereq_,module,exports){
var utils = _dereq_('../utils');

module.exports = function () {

  this.listenTo = function (el, event, func) {
    var els = el;
    if (!func) {
      func = event;
      event = el;
      els = [this.el];
    }
    if (utils.isString(el)) {
      els = this.select(el);
    } else if (!utils.isArray(el) && !(el instanceof NodeList)) {
      els = [el];
    }
    func = utils.isString(func) ? this[func] : func;
    this._listeners = this._listeners || {};
    var createRemovedListener = function (el) {
      return function (event) {
        var e = event.target;
        if (!e || e instanceof Text) { return; }
        var eid;
        if (e === window) {
          eid = 'window';
        } else if (e === window.document) {
          eid = 'document';
        } else {
          eid = e.getAttribute('data-sector-eid');
        }
        if (this._listeners[eid]) {
          this.trace('element removed', e);
          this.stopListening(e);
        }
      };
    };
    var createListener = function () {
      return function (event) {
        this.trace && this.trace('<- ' + event.target + '.' + event.type);
        func.apply(this, arguments);
      };
    };
    for (var i = 0, l = els.length; i < l; i++) {
      var e = els[i];
      if (!e) { continue; }
      var eid;
      if (e === window) {
        eid = 'window';
      } else if (e === window.document) {
        eid = 'document';
      } else {
        eid = e.getAttribute('data-sector-eid');
      }
      if (!eid) {
        eid = utils.uniqueId('e');
        e.setAttribute('data-sector-eid', eid);
      }
      if (!this._listeners[eid]) {
        this._listeners[eid] = {};
        this._listeners[eid].DOMNodeRemoved = utils.bind(createRemovedListener(e), this);
        e.addEventListener('DOMNodeRemoved', this._listeners[eid].DOMNodeRemoved, false);
      }
      if (this._listeners[eid][event]) {
        e.removeEventListener(event, this._listeners[eid][event], false);
      }
      this._listeners[eid][event] = utils.bind(createListener(), this);
      this.trace && this.trace('<+> ' + e + '.' + event);
      e.addEventListener(event, this._listeners[eid][event], false);
    }
  };

  this.stopListening = function (el, event) {
    var els = el;
    if (arguments.length === 1 && utils.isString(el)) {
      event = el;
      els = [this.el];
    } else if (utils.isString(el)) {
      els = this.select(el);
    } else if (!utils.isArray(el) && !(el instanceof NodeList)) {
      els = [el];
    }
    for (var i = 0, l = els.length; i < l; i++) {
      var e = els[i];
      if (!e) { continue; }
      var eid;
      if (e === window) {
        eid = 'window';
      } else if (e === window.document) {
        eid = 'document';
      } else {
        eid = e.getAttribute('data-sector-eid');
      }
      if (!this._listeners || !this._listeners[eid]) { continue; }
      if (event && !this._listeners[eid][event]) { continue; }
      if (!event) {
        for (var ev in this._listeners[eid]) {
          this.trace && this.trace('<x> ' + e + '.' + ev);
          e.removeEventListener(ev, this._listeners[eid][ev]);
        }
      } else {
        this.trace && this.trace('<x> ' + e + '.' + event);
        e.removeEventListener(event, this._listeners[eid][event]);
        delete this._listeners[eid][event];
      }
      if (this._listeners[eid].length === 0) {
        delete this._listeners[eid];
      }
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

module.exports = function () {

  this.publish = function (topic, data) {
    this.trace && this.trace('=>> ' + topic , data);
    var e = utils.createEvent('pubsub.' + topic,
      { topis: topic, data: data }
    );
    window.document.dispatchEvent(e);
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
    this.trace && this.trace('<<x>> ' + topic);
    this.stopListening(window.document, 'pubsub.' + topic);
  };
};
},{"../utils":12}],7:[function(_dereq_,module,exports){
var utils = _dereq_('../utils');

module.exports = function () {
  if (!console) { return; }
  utils.defaults(this.defaults, {debug: false});

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

var View = function () {
  var _templateCache = {};

  this.bindUI = function () {
    if (this.ui) {
      this._ui || ( this._ui = this.ui);
      var binding = utils.result(this,'_ui');
      this.trace('binding UI', binding);
      this.ui = {};
      utils.forIn(binding, function (selector, key) {
        this.ui[key] = this.select(selector, true);
      }, this);
    }
  };

  this.unbindUI = function () {
    if (this.ui) {
      this._ui || ( this._ui = this.ui);
      var binding = utils.result(this,'_ui');
      this.trace('unbinding UI', binding);
      utils.forIn(binding, function (selector, key) {
        delete this.ui[key];
      }, this);
    }
  };

  this.bindEvents = function () {
    if (this.events) {
      this.trace('binding events', this.events);
      utils.forIn(this.events, function (func, event) {
        var el, type, parts = event.split('.', 2);
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

  this.unbindEvents = function () {
    if (this.events) {
      this.trace('unbinding events', this.events);
      utils.forIn(this.events, function (func, event) {
        var el, type, parts = event.split('.', 2);
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
        this.unbindEvents();
        this.unbindUI();
        if (utils.isFunction(this.template)) {
          html = this.template(data);
        } else {
          if (utils.has(_templateCache, this.template)) {
            source = _templateCache[this.template];
          } else {
            el = utils.selectOne(this.template);
            if (!el) { throw Error('template ' + this.template + ' not found'); }
            source = el.innerHTML;
            _templateCache[this.template] = source;
          }
          html = utils.template(source, data || {});
        }
        this.el.innerHTML = html;
        this.bindUI();
        this.bindEvents();
      }
    };
  }

  this.remove = function () {
    this.el.parentNode.removeChild(this.el);
    this.destroy();
  };

  this.before('initialize', function () {
    this.bindUI();
    this.bindEvents();
  });
};

module.exports = View;
},{"../utils":12}],9:[function(_dereq_,module,exports){
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
  delete this.instancesAll[id];
  delete this.instances[instance.type][id];
};

Registry.prototype.removeInstancesOf = function (component) {
  var type = utils.isString(component) ? component : component.type;
  var instances = this.instances[type];
  for (var id in instances) {
    delete this.instancesAll[id];
  }
  delete this.instances[type];
};

module.exports = new Registry();
},{"./utils":12}],10:[function(_dereq_,module,exports){
/* global _ */
if ('undefined' !== typeof _) {
  exports.omit = _.omit;
  exports.pick = _.pick;
  exports.has = _.has;
  exports.defaults = _.defaults;
  exports.isString = _.isString;
  exports.isArray = _.isArray;
  exports.isFunction = _.isFunction;
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
  exports.forEach = _.forEach;
  exports.map = _.map;
}
},{}],11:[function(_dereq_,module,exports){
exports.omit = _dereq_('lodash-node/modern/objects/omit');
exports.pick = _dereq_('lodash-node/modern/objects/pick');
exports.has = _dereq_('lodash-node/modern/objects/has');
exports.defaults = _dereq_('lodash-node/modern/objects/defaults');
exports.isString = _dereq_('lodash-node/modern/objects/isString');
exports.isArray = _dereq_('lodash-node/modern/objects/isArray');
exports.isFunction = _dereq_('lodash-node/modern/objects/isFunction');
exports.forIn = _dereq_('lodash-node/modern/objects/forIn');
exports.values = _dereq_('lodash-node/modern/objects/values');
exports.create = _dereq_('lodash-node/modern/objects/create');
exports.result = _dereq_('lodash-node/modern/utilities/result');
exports.uniqueId = _dereq_('lodash-node/modern/utilities/uniqueId');
exports.noop = _dereq_('lodash-node/modern/utilities/noop');
exports.template = _dereq_('lodash-node/modern/utilities/template');
exports.wrap = _dereq_('lodash-node/modern/functions/wrap');
exports.bind = _dereq_('lodash-node/modern/functions/bind');
exports.bindAll = _dereq_('lodash-node/modern/functions/bindAll');
exports.forEach = _dereq_('lodash-node/modern/collections/forEach');
exports.map = _dereq_('lodash-node/modern/collections/map');
},{"lodash-node/modern/collections/forEach":14,"lodash-node/modern/collections/map":15,"lodash-node/modern/functions/bind":16,"lodash-node/modern/functions/bindAll":17,"lodash-node/modern/functions/wrap":19,"lodash-node/modern/objects/create":52,"lodash-node/modern/objects/defaults":53,"lodash-node/modern/objects/forIn":54,"lodash-node/modern/objects/has":57,"lodash-node/modern/objects/isArray":59,"lodash-node/modern/objects/isFunction":60,"lodash-node/modern/objects/isString":62,"lodash-node/modern/objects/omit":64,"lodash-node/modern/objects/pick":65,"lodash-node/modern/objects/values":66,"lodash-node/modern/utilities/noop":70,"lodash-node/modern/utilities/result":72,"lodash-node/modern/utilities/template":73,"lodash-node/modern/utilities/uniqueId":75}],12:[function(_dereq_,module,exports){

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
  if (document.readyState === 'complete' ||
      document.readyState === 'loaded' ||
      document.readyState === 'interactive') {
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

exports.selectOne = function (el, selector) {
  return exports.select(el, selector, true);
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

exports.createElement = _dereq_('domify');
exports.extend = _dereq_('lodash-node/modern/objects/assign');
exports.extend(exports, _dereq_('./utils-ext-global'));
exports.extend(exports, _dereq_('./utils-ext-require'));
},{"./utils-ext-global":10,"./utils-ext-require":11,"domify":13,"lodash-node/modern/objects/assign":51}],13:[function(_dereq_,module,exports){

/**
 * Expose `parse`.
 */

module.exports = parse;

/**
 * Wrap map from jquery.
 */

var map = {
  legend: [1, '<fieldset>', '</fieldset>'],
  tr: [2, '<table><tbody>', '</tbody></table>'],
  col: [2, '<table><tbody></tbody><colgroup>', '</colgroup></table>'],
  _default: [0, '', '']
};

map.td =
map.th = [3, '<table><tbody><tr>', '</tr></tbody></table>'];

map.option =
map.optgroup = [1, '<select multiple="multiple">', '</select>'];

map.thead =
map.tbody =
map.colgroup =
map.caption =
map.tfoot = [1, '<table>', '</table>'];

map.text =
map.circle =
map.ellipse =
map.line =
map.path =
map.polygon =
map.polyline =
map.rect = [1, '<svg xmlns="http://www.w3.org/2000/svg" version="1.1">','</svg>'];

/**
 * Parse `html` and return the children.
 *
 * @param {String} html
 * @return {Array}
 * @api private
 */

function parse(html) {
  if ('string' != typeof html) throw new TypeError('String expected');
  
  // tag name
  var m = /<([\w:]+)/.exec(html);
  if (!m) return document.createTextNode(html);

  html = html.replace(/^\s+|\s+$/g, ''); // Remove leading/trailing whitespace

  var tag = m[1];

  // body support
  if (tag == 'body') {
    var el = document.createElement('html');
    el.innerHTML = html;
    return el.removeChild(el.lastChild);
  }

  // wrap map
  var wrap = map[tag] || map._default;
  var depth = wrap[0];
  var prefix = wrap[1];
  var suffix = wrap[2];
  var el = document.createElement('div');
  el.innerHTML = prefix + html + suffix;
  while (depth--) el = el.lastChild;

  // one element
  if (el.firstChild == el.lastChild) {
    return el.removeChild(el.firstChild);
  }

  // several elements
  var fragment = document.createDocumentFragment();
  while (el.firstChild) {
    fragment.appendChild(el.removeChild(el.firstChild));
  }

  return fragment;
}

},{}],14:[function(_dereq_,module,exports){
/**
 * Lo-Dash 2.4.1 (Custom Build) <http://lodash.com/>
 * Build: `lodash modularize modern exports="node" -o ./modern/`
 * Copyright 2012-2013 The Dojo Foundation <http://dojofoundation.org/>
 * Based on Underscore.js 1.5.2 <http://underscorejs.org/LICENSE>
 * Copyright 2009-2013 Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
 * Available under MIT license <http://lodash.com/license>
 */
var baseCreateCallback = _dereq_('../internals/baseCreateCallback'),
    forOwn = _dereq_('../objects/forOwn');

/**
 * Iterates over elements of a collection, executing the callback for each
 * element. The callback is bound to `thisArg` and invoked with three arguments;
 * (value, index|key, collection). Callbacks may exit iteration early by
 * explicitly returning `false`.
 *
 * Note: As with other "Collections" methods, objects with a `length` property
 * are iterated like arrays. To avoid this behavior `_.forIn` or `_.forOwn`
 * may be used for object iteration.
 *
 * @static
 * @memberOf _
 * @alias each
 * @category Collections
 * @param {Array|Object|string} collection The collection to iterate over.
 * @param {Function} [callback=identity] The function called per iteration.
 * @param {*} [thisArg] The `this` binding of `callback`.
 * @returns {Array|Object|string} Returns `collection`.
 * @example
 *
 * _([1, 2, 3]).forEach(function(num) { console.log(num); }).join(',');
 * // => logs each number and returns '1,2,3'
 *
 * _.forEach({ 'one': 1, 'two': 2, 'three': 3 }, function(num) { console.log(num); });
 * // => logs each number and returns the object (property order is not guaranteed across environments)
 */
function forEach(collection, callback, thisArg) {
  var index = -1,
      length = collection ? collection.length : 0;

  callback = callback && typeof thisArg == 'undefined' ? callback : baseCreateCallback(callback, thisArg, 3);
  if (typeof length == 'number') {
    while (++index < length) {
      if (callback(collection[index], index, collection) === false) {
        break;
      }
    }
  } else {
    forOwn(collection, callback);
  }
  return collection;
}

module.exports = forEach;

},{"../internals/baseCreateCallback":23,"../objects/forOwn":55}],15:[function(_dereq_,module,exports){
/**
 * Lo-Dash 2.4.1 (Custom Build) <http://lodash.com/>
 * Build: `lodash modularize modern exports="node" -o ./modern/`
 * Copyright 2012-2013 The Dojo Foundation <http://dojofoundation.org/>
 * Based on Underscore.js 1.5.2 <http://underscorejs.org/LICENSE>
 * Copyright 2009-2013 Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
 * Available under MIT license <http://lodash.com/license>
 */
var createCallback = _dereq_('../functions/createCallback'),
    forOwn = _dereq_('../objects/forOwn');

/**
 * Creates an array of values by running each element in the collection
 * through the callback. The callback is bound to `thisArg` and invoked with
 * three arguments; (value, index|key, collection).
 *
 * If a property name is provided for `callback` the created "_.pluck" style
 * callback will return the property value of the given element.
 *
 * If an object is provided for `callback` the created "_.where" style callback
 * will return `true` for elements that have the properties of the given object,
 * else `false`.
 *
 * @static
 * @memberOf _
 * @alias collect
 * @category Collections
 * @param {Array|Object|string} collection The collection to iterate over.
 * @param {Function|Object|string} [callback=identity] The function called
 *  per iteration. If a property name or object is provided it will be used
 *  to create a "_.pluck" or "_.where" style callback, respectively.
 * @param {*} [thisArg] The `this` binding of `callback`.
 * @returns {Array} Returns a new array of the results of each `callback` execution.
 * @example
 *
 * _.map([1, 2, 3], function(num) { return num * 3; });
 * // => [3, 6, 9]
 *
 * _.map({ 'one': 1, 'two': 2, 'three': 3 }, function(num) { return num * 3; });
 * // => [3, 6, 9] (property order is not guaranteed across environments)
 *
 * var characters = [
 *   { 'name': 'barney', 'age': 36 },
 *   { 'name': 'fred',   'age': 40 }
 * ];
 *
 * // using "_.pluck" callback shorthand
 * _.map(characters, 'name');
 * // => ['barney', 'fred']
 */
function map(collection, callback, thisArg) {
  var index = -1,
      length = collection ? collection.length : 0;

  callback = createCallback(callback, thisArg, 3);
  if (typeof length == 'number') {
    var result = Array(length);
    while (++index < length) {
      result[index] = callback(collection[index], index, collection);
    }
  } else {
    result = [];
    forOwn(collection, function(value, key, collection) {
      result[++index] = callback(value, key, collection);
    });
  }
  return result;
}

module.exports = map;

},{"../functions/createCallback":18,"../objects/forOwn":55}],16:[function(_dereq_,module,exports){
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

},{"../internals/createWrapper":32,"../internals/slice":50}],17:[function(_dereq_,module,exports){
/**
 * Lo-Dash 2.4.1 (Custom Build) <http://lodash.com/>
 * Build: `lodash modularize modern exports="node" -o ./modern/`
 * Copyright 2012-2013 The Dojo Foundation <http://dojofoundation.org/>
 * Based on Underscore.js 1.5.2 <http://underscorejs.org/LICENSE>
 * Copyright 2009-2013 Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
 * Available under MIT license <http://lodash.com/license>
 */
var baseFlatten = _dereq_('../internals/baseFlatten'),
    createWrapper = _dereq_('../internals/createWrapper'),
    functions = _dereq_('../objects/functions');

/**
 * Binds methods of an object to the object itself, overwriting the existing
 * method. Method names may be specified as individual arguments or as arrays
 * of method names. If no method names are provided all the function properties
 * of `object` will be bound.
 *
 * @static
 * @memberOf _
 * @category Functions
 * @param {Object} object The object to bind and assign the bound methods to.
 * @param {...string} [methodName] The object method names to
 *  bind, specified as individual method names or arrays of method names.
 * @returns {Object} Returns `object`.
 * @example
 *
 * var view = {
 *   'label': 'docs',
 *   'onClick': function() { console.log('clicked ' + this.label); }
 * };
 *
 * _.bindAll(view);
 * jQuery('#docs').on('click', view.onClick);
 * // => logs 'clicked docs', when the button is clicked
 */
function bindAll(object) {
  var funcs = arguments.length > 1 ? baseFlatten(arguments, true, false, 1) : functions(object),
      index = -1,
      length = funcs.length;

  while (++index < length) {
    var key = funcs[index];
    object[key] = createWrapper(object[key], 1, null, null, object);
  }
  return object;
}

module.exports = bindAll;

},{"../internals/baseFlatten":26,"../internals/createWrapper":32,"../objects/functions":56}],18:[function(_dereq_,module,exports){
/**
 * Lo-Dash 2.4.1 (Custom Build) <http://lodash.com/>
 * Build: `lodash modularize modern exports="node" -o ./modern/`
 * Copyright 2012-2013 The Dojo Foundation <http://dojofoundation.org/>
 * Based on Underscore.js 1.5.2 <http://underscorejs.org/LICENSE>
 * Copyright 2009-2013 Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
 * Available under MIT license <http://lodash.com/license>
 */
var baseCreateCallback = _dereq_('../internals/baseCreateCallback'),
    baseIsEqual = _dereq_('../internals/baseIsEqual'),
    isObject = _dereq_('../objects/isObject'),
    keys = _dereq_('../objects/keys'),
    property = _dereq_('../utilities/property');

/**
 * Produces a callback bound to an optional `thisArg`. If `func` is a property
 * name the created callback will return the property value for a given element.
 * If `func` is an object the created callback will return `true` for elements
 * that contain the equivalent object properties, otherwise it will return `false`.
 *
 * @static
 * @memberOf _
 * @category Utilities
 * @param {*} [func=identity] The value to convert to a callback.
 * @param {*} [thisArg] The `this` binding of the created callback.
 * @param {number} [argCount] The number of arguments the callback accepts.
 * @returns {Function} Returns a callback function.
 * @example
 *
 * var characters = [
 *   { 'name': 'barney', 'age': 36 },
 *   { 'name': 'fred',   'age': 40 }
 * ];
 *
 * // wrap to create custom callback shorthands
 * _.createCallback = _.wrap(_.createCallback, function(func, callback, thisArg) {
 *   var match = /^(.+?)__([gl]t)(.+)$/.exec(callback);
 *   return !match ? func(callback, thisArg) : function(object) {
 *     return match[2] == 'gt' ? object[match[1]] > match[3] : object[match[1]] < match[3];
 *   };
 * });
 *
 * _.filter(characters, 'age__gt38');
 * // => [{ 'name': 'fred', 'age': 40 }]
 */
function createCallback(func, thisArg, argCount) {
  var type = typeof func;
  if (func == null || type == 'function') {
    return baseCreateCallback(func, thisArg, argCount);
  }
  // handle "_.pluck" style callback shorthands
  if (type != 'object') {
    return property(func);
  }
  var props = keys(func),
      key = props[0],
      a = func[key];

  // handle "_.where" style callback shorthands
  if (props.length == 1 && a === a && !isObject(a)) {
    // fast path the common case of providing an object with a single
    // property containing a primitive value
    return function(object) {
      var b = object[key];
      return a === b && (a !== 0 || (1 / a == 1 / b));
    };
  }
  return function(object) {
    var length = props.length,
        result = false;

    while (length--) {
      if (!(result = baseIsEqual(object[props[length]], func[props[length]], null, true))) {
        break;
      }
    }
    return result;
  };
}

module.exports = createCallback;

},{"../internals/baseCreateCallback":23,"../internals/baseIsEqual":28,"../objects/isObject":61,"../objects/keys":63,"../utilities/property":71}],19:[function(_dereq_,module,exports){
/**
 * Lo-Dash 2.4.1 (Custom Build) <http://lodash.com/>
 * Build: `lodash modularize modern exports="node" -o ./modern/`
 * Copyright 2012-2013 The Dojo Foundation <http://dojofoundation.org/>
 * Based on Underscore.js 1.5.2 <http://underscorejs.org/LICENSE>
 * Copyright 2009-2013 Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
 * Available under MIT license <http://lodash.com/license>
 */
var createWrapper = _dereq_('../internals/createWrapper');

/**
 * Creates a function that provides `value` to the wrapper function as its
 * first argument. Additional arguments provided to the function are appended
 * to those provided to the wrapper function. The wrapper is executed with
 * the `this` binding of the created function.
 *
 * @static
 * @memberOf _
 * @category Functions
 * @param {*} value The value to wrap.
 * @param {Function} wrapper The wrapper function.
 * @returns {Function} Returns the new function.
 * @example
 *
 * var p = _.wrap(_.escape, function(func, text) {
 *   return '<p>' + func(text) + '</p>';
 * });
 *
 * p('Fred, Wilma, & Pebbles');
 * // => '<p>Fred, Wilma, &amp; Pebbles</p>'
 */
function wrap(value, wrapper) {
  return createWrapper(wrapper, 16, [value]);
}

module.exports = wrap;

},{"../internals/createWrapper":32}],20:[function(_dereq_,module,exports){
/**
 * Lo-Dash 2.4.1 (Custom Build) <http://lodash.com/>
 * Build: `lodash modularize modern exports="node" -o ./modern/`
 * Copyright 2012-2013 The Dojo Foundation <http://dojofoundation.org/>
 * Based on Underscore.js 1.5.2 <http://underscorejs.org/LICENSE>
 * Copyright 2009-2013 Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
 * Available under MIT license <http://lodash.com/license>
 */

/** Used to pool arrays and objects used internally */
var arrayPool = [];

module.exports = arrayPool;

},{}],21:[function(_dereq_,module,exports){
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

},{"../objects/isObject":61,"./baseCreate":22,"./setBindData":48,"./slice":50}],22:[function(_dereq_,module,exports){
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
},{"../objects/isObject":61,"../utilities/noop":70,"./isNative":38}],23:[function(_dereq_,module,exports){
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

},{"../functions/bind":16,"../support":67,"../utilities/identity":69,"./setBindData":48}],24:[function(_dereq_,module,exports){
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

},{"../objects/isObject":61,"./baseCreate":22,"./setBindData":48,"./slice":50}],25:[function(_dereq_,module,exports){
/**
 * Lo-Dash 2.4.1 (Custom Build) <http://lodash.com/>
 * Build: `lodash modularize modern exports="node" -o ./modern/`
 * Copyright 2012-2013 The Dojo Foundation <http://dojofoundation.org/>
 * Based on Underscore.js 1.5.2 <http://underscorejs.org/LICENSE>
 * Copyright 2009-2013 Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
 * Available under MIT license <http://lodash.com/license>
 */
var baseIndexOf = _dereq_('./baseIndexOf'),
    cacheIndexOf = _dereq_('./cacheIndexOf'),
    createCache = _dereq_('./createCache'),
    largeArraySize = _dereq_('./largeArraySize'),
    releaseObject = _dereq_('./releaseObject');

/**
 * The base implementation of `_.difference` that accepts a single array
 * of values to exclude.
 *
 * @private
 * @param {Array} array The array to process.
 * @param {Array} [values] The array of values to exclude.
 * @returns {Array} Returns a new array of filtered values.
 */
function baseDifference(array, values) {
  var index = -1,
      indexOf = baseIndexOf,
      length = array ? array.length : 0,
      isLarge = length >= largeArraySize,
      result = [];

  if (isLarge) {
    var cache = createCache(values);
    if (cache) {
      indexOf = cacheIndexOf;
      values = cache;
    } else {
      isLarge = false;
    }
  }
  while (++index < length) {
    var value = array[index];
    if (indexOf(values, value) < 0) {
      result.push(value);
    }
  }
  if (isLarge) {
    releaseObject(values);
  }
  return result;
}

module.exports = baseDifference;

},{"./baseIndexOf":27,"./cacheIndexOf":29,"./createCache":31,"./largeArraySize":40,"./releaseObject":47}],26:[function(_dereq_,module,exports){
/**
 * Lo-Dash 2.4.1 (Custom Build) <http://lodash.com/>
 * Build: `lodash modularize modern exports="node" -o ./modern/`
 * Copyright 2012-2013 The Dojo Foundation <http://dojofoundation.org/>
 * Based on Underscore.js 1.5.2 <http://underscorejs.org/LICENSE>
 * Copyright 2009-2013 Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
 * Available under MIT license <http://lodash.com/license>
 */
var isArguments = _dereq_('../objects/isArguments'),
    isArray = _dereq_('../objects/isArray');

/**
 * The base implementation of `_.flatten` without support for callback
 * shorthands or `thisArg` binding.
 *
 * @private
 * @param {Array} array The array to flatten.
 * @param {boolean} [isShallow=false] A flag to restrict flattening to a single level.
 * @param {boolean} [isStrict=false] A flag to restrict flattening to arrays and `arguments` objects.
 * @param {number} [fromIndex=0] The index to start from.
 * @returns {Array} Returns a new flattened array.
 */
function baseFlatten(array, isShallow, isStrict, fromIndex) {
  var index = (fromIndex || 0) - 1,
      length = array ? array.length : 0,
      result = [];

  while (++index < length) {
    var value = array[index];

    if (value && typeof value == 'object' && typeof value.length == 'number'
        && (isArray(value) || isArguments(value))) {
      // recursively flatten arrays (susceptible to call stack limits)
      if (!isShallow) {
        value = baseFlatten(value, isShallow, isStrict);
      }
      var valIndex = -1,
          valLength = value.length,
          resIndex = result.length;

      result.length += valLength;
      while (++valIndex < valLength) {
        result[resIndex++] = value[valIndex];
      }
    } else if (!isStrict) {
      result.push(value);
    }
  }
  return result;
}

module.exports = baseFlatten;

},{"../objects/isArguments":58,"../objects/isArray":59}],27:[function(_dereq_,module,exports){
/**
 * Lo-Dash 2.4.1 (Custom Build) <http://lodash.com/>
 * Build: `lodash modularize modern exports="node" -o ./modern/`
 * Copyright 2012-2013 The Dojo Foundation <http://dojofoundation.org/>
 * Based on Underscore.js 1.5.2 <http://underscorejs.org/LICENSE>
 * Copyright 2009-2013 Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
 * Available under MIT license <http://lodash.com/license>
 */

/**
 * The base implementation of `_.indexOf` without support for binary searches
 * or `fromIndex` constraints.
 *
 * @private
 * @param {Array} array The array to search.
 * @param {*} value The value to search for.
 * @param {number} [fromIndex=0] The index to search from.
 * @returns {number} Returns the index of the matched value or `-1`.
 */
function baseIndexOf(array, value, fromIndex) {
  var index = (fromIndex || 0) - 1,
      length = array ? array.length : 0;

  while (++index < length) {
    if (array[index] === value) {
      return index;
    }
  }
  return -1;
}

module.exports = baseIndexOf;

},{}],28:[function(_dereq_,module,exports){
/**
 * Lo-Dash 2.4.1 (Custom Build) <http://lodash.com/>
 * Build: `lodash modularize modern exports="node" -o ./modern/`
 * Copyright 2012-2013 The Dojo Foundation <http://dojofoundation.org/>
 * Based on Underscore.js 1.5.2 <http://underscorejs.org/LICENSE>
 * Copyright 2009-2013 Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
 * Available under MIT license <http://lodash.com/license>
 */
var forIn = _dereq_('../objects/forIn'),
    getArray = _dereq_('./getArray'),
    isFunction = _dereq_('../objects/isFunction'),
    objectTypes = _dereq_('./objectTypes'),
    releaseArray = _dereq_('./releaseArray');

/** `Object#toString` result shortcuts */
var argsClass = '[object Arguments]',
    arrayClass = '[object Array]',
    boolClass = '[object Boolean]',
    dateClass = '[object Date]',
    numberClass = '[object Number]',
    objectClass = '[object Object]',
    regexpClass = '[object RegExp]',
    stringClass = '[object String]';

/** Used for native method references */
var objectProto = Object.prototype;

/** Used to resolve the internal [[Class]] of values */
var toString = objectProto.toString;

/** Native method shortcuts */
var hasOwnProperty = objectProto.hasOwnProperty;

/**
 * The base implementation of `_.isEqual`, without support for `thisArg` binding,
 * that allows partial "_.where" style comparisons.
 *
 * @private
 * @param {*} a The value to compare.
 * @param {*} b The other value to compare.
 * @param {Function} [callback] The function to customize comparing values.
 * @param {Function} [isWhere=false] A flag to indicate performing partial comparisons.
 * @param {Array} [stackA=[]] Tracks traversed `a` objects.
 * @param {Array} [stackB=[]] Tracks traversed `b` objects.
 * @returns {boolean} Returns `true` if the values are equivalent, else `false`.
 */
function baseIsEqual(a, b, callback, isWhere, stackA, stackB) {
  // used to indicate that when comparing objects, `a` has at least the properties of `b`
  if (callback) {
    var result = callback(a, b);
    if (typeof result != 'undefined') {
      return !!result;
    }
  }
  // exit early for identical values
  if (a === b) {
    // treat `+0` vs. `-0` as not equal
    return a !== 0 || (1 / a == 1 / b);
  }
  var type = typeof a,
      otherType = typeof b;

  // exit early for unlike primitive values
  if (a === a &&
      !(a && objectTypes[type]) &&
      !(b && objectTypes[otherType])) {
    return false;
  }
  // exit early for `null` and `undefined` avoiding ES3's Function#call behavior
  // http://es5.github.io/#x15.3.4.4
  if (a == null || b == null) {
    return a === b;
  }
  // compare [[Class]] names
  var className = toString.call(a),
      otherClass = toString.call(b);

  if (className == argsClass) {
    className = objectClass;
  }
  if (otherClass == argsClass) {
    otherClass = objectClass;
  }
  if (className != otherClass) {
    return false;
  }
  switch (className) {
    case boolClass:
    case dateClass:
      // coerce dates and booleans to numbers, dates to milliseconds and booleans
      // to `1` or `0` treating invalid dates coerced to `NaN` as not equal
      return +a == +b;

    case numberClass:
      // treat `NaN` vs. `NaN` as equal
      return (a != +a)
        ? b != +b
        // but treat `+0` vs. `-0` as not equal
        : (a == 0 ? (1 / a == 1 / b) : a == +b);

    case regexpClass:
    case stringClass:
      // coerce regexes to strings (http://es5.github.io/#x15.10.6.4)
      // treat string primitives and their corresponding object instances as equal
      return a == String(b);
  }
  var isArr = className == arrayClass;
  if (!isArr) {
    // unwrap any `lodash` wrapped values
    var aWrapped = hasOwnProperty.call(a, '__wrapped__'),
        bWrapped = hasOwnProperty.call(b, '__wrapped__');

    if (aWrapped || bWrapped) {
      return baseIsEqual(aWrapped ? a.__wrapped__ : a, bWrapped ? b.__wrapped__ : b, callback, isWhere, stackA, stackB);
    }
    // exit for functions and DOM nodes
    if (className != objectClass) {
      return false;
    }
    // in older versions of Opera, `arguments` objects have `Array` constructors
    var ctorA = a.constructor,
        ctorB = b.constructor;

    // non `Object` object instances with different constructors are not equal
    if (ctorA != ctorB &&
          !(isFunction(ctorA) && ctorA instanceof ctorA && isFunction(ctorB) && ctorB instanceof ctorB) &&
          ('constructor' in a && 'constructor' in b)
        ) {
      return false;
    }
  }
  // assume cyclic structures are equal
  // the algorithm for detecting cyclic structures is adapted from ES 5.1
  // section 15.12.3, abstract operation `JO` (http://es5.github.io/#x15.12.3)
  var initedStack = !stackA;
  stackA || (stackA = getArray());
  stackB || (stackB = getArray());

  var length = stackA.length;
  while (length--) {
    if (stackA[length] == a) {
      return stackB[length] == b;
    }
  }
  var size = 0;
  result = true;

  // add `a` and `b` to the stack of traversed objects
  stackA.push(a);
  stackB.push(b);

  // recursively compare objects and arrays (susceptible to call stack limits)
  if (isArr) {
    // compare lengths to determine if a deep comparison is necessary
    length = a.length;
    size = b.length;
    result = size == length;

    if (result || isWhere) {
      // deep compare the contents, ignoring non-numeric properties
      while (size--) {
        var index = length,
            value = b[size];

        if (isWhere) {
          while (index--) {
            if ((result = baseIsEqual(a[index], value, callback, isWhere, stackA, stackB))) {
              break;
            }
          }
        } else if (!(result = baseIsEqual(a[size], value, callback, isWhere, stackA, stackB))) {
          break;
        }
      }
    }
  }
  else {
    // deep compare objects using `forIn`, instead of `forOwn`, to avoid `Object.keys`
    // which, in this case, is more costly
    forIn(b, function(value, key, b) {
      if (hasOwnProperty.call(b, key)) {
        // count the number of properties.
        size++;
        // deep compare each property value.
        return (result = hasOwnProperty.call(a, key) && baseIsEqual(a[key], value, callback, isWhere, stackA, stackB));
      }
    });

    if (result && !isWhere) {
      // ensure both objects have the same number of properties
      forIn(a, function(value, key, a) {
        if (hasOwnProperty.call(a, key)) {
          // `size` will be `-1` if `a` has more properties than `b`
          return (result = --size > -1);
        }
      });
    }
  }
  stackA.pop();
  stackB.pop();

  if (initedStack) {
    releaseArray(stackA);
    releaseArray(stackB);
  }
  return result;
}

module.exports = baseIsEqual;

},{"../objects/forIn":54,"../objects/isFunction":60,"./getArray":35,"./objectTypes":43,"./releaseArray":46}],29:[function(_dereq_,module,exports){
/**
 * Lo-Dash 2.4.1 (Custom Build) <http://lodash.com/>
 * Build: `lodash modularize modern exports="node" -o ./modern/`
 * Copyright 2012-2013 The Dojo Foundation <http://dojofoundation.org/>
 * Based on Underscore.js 1.5.2 <http://underscorejs.org/LICENSE>
 * Copyright 2009-2013 Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
 * Available under MIT license <http://lodash.com/license>
 */
var baseIndexOf = _dereq_('./baseIndexOf'),
    keyPrefix = _dereq_('./keyPrefix');

/**
 * An implementation of `_.contains` for cache objects that mimics the return
 * signature of `_.indexOf` by returning `0` if the value is found, else `-1`.
 *
 * @private
 * @param {Object} cache The cache object to inspect.
 * @param {*} value The value to search for.
 * @returns {number} Returns `0` if `value` is found, else `-1`.
 */
function cacheIndexOf(cache, value) {
  var type = typeof value;
  cache = cache.cache;

  if (type == 'boolean' || value == null) {
    return cache[value] ? 0 : -1;
  }
  if (type != 'number' && type != 'string') {
    type = 'object';
  }
  var key = type == 'number' ? value : keyPrefix + value;
  cache = (cache = cache[type]) && cache[key];

  return type == 'object'
    ? (cache && baseIndexOf(cache, value) > -1 ? 0 : -1)
    : (cache ? 0 : -1);
}

module.exports = cacheIndexOf;

},{"./baseIndexOf":27,"./keyPrefix":39}],30:[function(_dereq_,module,exports){
/**
 * Lo-Dash 2.4.1 (Custom Build) <http://lodash.com/>
 * Build: `lodash modularize modern exports="node" -o ./modern/`
 * Copyright 2012-2013 The Dojo Foundation <http://dojofoundation.org/>
 * Based on Underscore.js 1.5.2 <http://underscorejs.org/LICENSE>
 * Copyright 2009-2013 Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
 * Available under MIT license <http://lodash.com/license>
 */
var keyPrefix = _dereq_('./keyPrefix');

/**
 * Adds a given value to the corresponding cache object.
 *
 * @private
 * @param {*} value The value to add to the cache.
 */
function cachePush(value) {
  var cache = this.cache,
      type = typeof value;

  if (type == 'boolean' || value == null) {
    cache[value] = true;
  } else {
    if (type != 'number' && type != 'string') {
      type = 'object';
    }
    var key = type == 'number' ? value : keyPrefix + value,
        typeCache = cache[type] || (cache[type] = {});

    if (type == 'object') {
      (typeCache[key] || (typeCache[key] = [])).push(value);
    } else {
      typeCache[key] = true;
    }
  }
}

module.exports = cachePush;

},{"./keyPrefix":39}],31:[function(_dereq_,module,exports){
/**
 * Lo-Dash 2.4.1 (Custom Build) <http://lodash.com/>
 * Build: `lodash modularize modern exports="node" -o ./modern/`
 * Copyright 2012-2013 The Dojo Foundation <http://dojofoundation.org/>
 * Based on Underscore.js 1.5.2 <http://underscorejs.org/LICENSE>
 * Copyright 2009-2013 Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
 * Available under MIT license <http://lodash.com/license>
 */
var cachePush = _dereq_('./cachePush'),
    getObject = _dereq_('./getObject'),
    releaseObject = _dereq_('./releaseObject');

/**
 * Creates a cache object to optimize linear searches of large arrays.
 *
 * @private
 * @param {Array} [array=[]] The array to search.
 * @returns {null|Object} Returns the cache object or `null` if caching should not be used.
 */
function createCache(array) {
  var index = -1,
      length = array.length,
      first = array[0],
      mid = array[(length / 2) | 0],
      last = array[length - 1];

  if (first && typeof first == 'object' &&
      mid && typeof mid == 'object' && last && typeof last == 'object') {
    return false;
  }
  var cache = getObject();
  cache['false'] = cache['null'] = cache['true'] = cache['undefined'] = false;

  var result = getObject();
  result.array = array;
  result.cache = cache;
  result.push = cachePush;

  while (++index < length) {
    result.push(array[index]);
  }
  return result;
}

module.exports = createCache;

},{"./cachePush":30,"./getObject":36,"./releaseObject":47}],32:[function(_dereq_,module,exports){
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

},{"../objects/isFunction":60,"./baseBind":21,"./baseCreateWrapper":24,"./slice":50}],33:[function(_dereq_,module,exports){
/**
 * Lo-Dash 2.4.1 (Custom Build) <http://lodash.com/>
 * Build: `lodash modularize modern exports="node" -o ./modern/`
 * Copyright 2012-2013 The Dojo Foundation <http://dojofoundation.org/>
 * Based on Underscore.js 1.5.2 <http://underscorejs.org/LICENSE>
 * Copyright 2009-2013 Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
 * Available under MIT license <http://lodash.com/license>
 */
var htmlEscapes = _dereq_('./htmlEscapes');

/**
 * Used by `escape` to convert characters to HTML entities.
 *
 * @private
 * @param {string} match The matched character to escape.
 * @returns {string} Returns the escaped character.
 */
function escapeHtmlChar(match) {
  return htmlEscapes[match];
}

module.exports = escapeHtmlChar;

},{"./htmlEscapes":37}],34:[function(_dereq_,module,exports){
/**
 * Lo-Dash 2.4.1 (Custom Build) <http://lodash.com/>
 * Build: `lodash modularize modern exports="node" -o ./modern/`
 * Copyright 2012-2013 The Dojo Foundation <http://dojofoundation.org/>
 * Based on Underscore.js 1.5.2 <http://underscorejs.org/LICENSE>
 * Copyright 2009-2013 Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
 * Available under MIT license <http://lodash.com/license>
 */

/** Used to escape characters for inclusion in compiled string literals */
var stringEscapes = {
  '\\': '\\',
  "'": "'",
  '\n': 'n',
  '\r': 'r',
  '\t': 't',
  '\u2028': 'u2028',
  '\u2029': 'u2029'
};

/**
 * Used by `template` to escape characters for inclusion in compiled
 * string literals.
 *
 * @private
 * @param {string} match The matched character to escape.
 * @returns {string} Returns the escaped character.
 */
function escapeStringChar(match) {
  return '\\' + stringEscapes[match];
}

module.exports = escapeStringChar;

},{}],35:[function(_dereq_,module,exports){
/**
 * Lo-Dash 2.4.1 (Custom Build) <http://lodash.com/>
 * Build: `lodash modularize modern exports="node" -o ./modern/`
 * Copyright 2012-2013 The Dojo Foundation <http://dojofoundation.org/>
 * Based on Underscore.js 1.5.2 <http://underscorejs.org/LICENSE>
 * Copyright 2009-2013 Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
 * Available under MIT license <http://lodash.com/license>
 */
var arrayPool = _dereq_('./arrayPool');

/**
 * Gets an array from the array pool or creates a new one if the pool is empty.
 *
 * @private
 * @returns {Array} The array from the pool.
 */
function getArray() {
  return arrayPool.pop() || [];
}

module.exports = getArray;

},{"./arrayPool":20}],36:[function(_dereq_,module,exports){
/**
 * Lo-Dash 2.4.1 (Custom Build) <http://lodash.com/>
 * Build: `lodash modularize modern exports="node" -o ./modern/`
 * Copyright 2012-2013 The Dojo Foundation <http://dojofoundation.org/>
 * Based on Underscore.js 1.5.2 <http://underscorejs.org/LICENSE>
 * Copyright 2009-2013 Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
 * Available under MIT license <http://lodash.com/license>
 */
var objectPool = _dereq_('./objectPool');

/**
 * Gets an object from the object pool or creates a new one if the pool is empty.
 *
 * @private
 * @returns {Object} The object from the pool.
 */
function getObject() {
  return objectPool.pop() || {
    'array': null,
    'cache': null,
    'criteria': null,
    'false': false,
    'index': 0,
    'null': false,
    'number': null,
    'object': null,
    'push': null,
    'string': null,
    'true': false,
    'undefined': false,
    'value': null
  };
}

module.exports = getObject;

},{"./objectPool":42}],37:[function(_dereq_,module,exports){
/**
 * Lo-Dash 2.4.1 (Custom Build) <http://lodash.com/>
 * Build: `lodash modularize modern exports="node" -o ./modern/`
 * Copyright 2012-2013 The Dojo Foundation <http://dojofoundation.org/>
 * Based on Underscore.js 1.5.2 <http://underscorejs.org/LICENSE>
 * Copyright 2009-2013 Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
 * Available under MIT license <http://lodash.com/license>
 */

/**
 * Used to convert characters to HTML entities:
 *
 * Though the `>` character is escaped for symmetry, characters like `>` and `/`
 * don't require escaping in HTML and have no special meaning unless they're part
 * of a tag or an unquoted attribute value.
 * http://mathiasbynens.be/notes/ambiguous-ampersands (under "semi-related fun fact")
 */
var htmlEscapes = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
};

module.exports = htmlEscapes;

},{}],38:[function(_dereq_,module,exports){
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

},{}],39:[function(_dereq_,module,exports){
/**
 * Lo-Dash 2.4.1 (Custom Build) <http://lodash.com/>
 * Build: `lodash modularize modern exports="node" -o ./modern/`
 * Copyright 2012-2013 The Dojo Foundation <http://dojofoundation.org/>
 * Based on Underscore.js 1.5.2 <http://underscorejs.org/LICENSE>
 * Copyright 2009-2013 Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
 * Available under MIT license <http://lodash.com/license>
 */

/** Used to prefix keys to avoid issues with `__proto__` and properties on `Object.prototype` */
var keyPrefix = +new Date + '';

module.exports = keyPrefix;

},{}],40:[function(_dereq_,module,exports){
/**
 * Lo-Dash 2.4.1 (Custom Build) <http://lodash.com/>
 * Build: `lodash modularize modern exports="node" -o ./modern/`
 * Copyright 2012-2013 The Dojo Foundation <http://dojofoundation.org/>
 * Based on Underscore.js 1.5.2 <http://underscorejs.org/LICENSE>
 * Copyright 2009-2013 Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
 * Available under MIT license <http://lodash.com/license>
 */

/** Used as the size when optimizations are enabled for large arrays */
var largeArraySize = 75;

module.exports = largeArraySize;

},{}],41:[function(_dereq_,module,exports){
/**
 * Lo-Dash 2.4.1 (Custom Build) <http://lodash.com/>
 * Build: `lodash modularize modern exports="node" -o ./modern/`
 * Copyright 2012-2013 The Dojo Foundation <http://dojofoundation.org/>
 * Based on Underscore.js 1.5.2 <http://underscorejs.org/LICENSE>
 * Copyright 2009-2013 Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
 * Available under MIT license <http://lodash.com/license>
 */

/** Used as the max size of the `arrayPool` and `objectPool` */
var maxPoolSize = 40;

module.exports = maxPoolSize;

},{}],42:[function(_dereq_,module,exports){
/**
 * Lo-Dash 2.4.1 (Custom Build) <http://lodash.com/>
 * Build: `lodash modularize modern exports="node" -o ./modern/`
 * Copyright 2012-2013 The Dojo Foundation <http://dojofoundation.org/>
 * Based on Underscore.js 1.5.2 <http://underscorejs.org/LICENSE>
 * Copyright 2009-2013 Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
 * Available under MIT license <http://lodash.com/license>
 */

/** Used to pool arrays and objects used internally */
var objectPool = [];

module.exports = objectPool;

},{}],43:[function(_dereq_,module,exports){
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

},{}],44:[function(_dereq_,module,exports){
/**
 * Lo-Dash 2.4.1 (Custom Build) <http://lodash.com/>
 * Build: `lodash modularize modern exports="node" -o ./modern/`
 * Copyright 2012-2013 The Dojo Foundation <http://dojofoundation.org/>
 * Based on Underscore.js 1.5.2 <http://underscorejs.org/LICENSE>
 * Copyright 2009-2013 Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
 * Available under MIT license <http://lodash.com/license>
 */

/** Used to match "interpolate" template delimiters */
var reInterpolate = /<%=([\s\S]+?)%>/g;

module.exports = reInterpolate;

},{}],45:[function(_dereq_,module,exports){
/**
 * Lo-Dash 2.4.1 (Custom Build) <http://lodash.com/>
 * Build: `lodash modularize modern exports="node" -o ./modern/`
 * Copyright 2012-2013 The Dojo Foundation <http://dojofoundation.org/>
 * Based on Underscore.js 1.5.2 <http://underscorejs.org/LICENSE>
 * Copyright 2009-2013 Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
 * Available under MIT license <http://lodash.com/license>
 */
var htmlEscapes = _dereq_('./htmlEscapes'),
    keys = _dereq_('../objects/keys');

/** Used to match HTML entities and HTML characters */
var reUnescapedHtml = RegExp('[' + keys(htmlEscapes).join('') + ']', 'g');

module.exports = reUnescapedHtml;

},{"../objects/keys":63,"./htmlEscapes":37}],46:[function(_dereq_,module,exports){
/**
 * Lo-Dash 2.4.1 (Custom Build) <http://lodash.com/>
 * Build: `lodash modularize modern exports="node" -o ./modern/`
 * Copyright 2012-2013 The Dojo Foundation <http://dojofoundation.org/>
 * Based on Underscore.js 1.5.2 <http://underscorejs.org/LICENSE>
 * Copyright 2009-2013 Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
 * Available under MIT license <http://lodash.com/license>
 */
var arrayPool = _dereq_('./arrayPool'),
    maxPoolSize = _dereq_('./maxPoolSize');

/**
 * Releases the given array back to the array pool.
 *
 * @private
 * @param {Array} [array] The array to release.
 */
function releaseArray(array) {
  array.length = 0;
  if (arrayPool.length < maxPoolSize) {
    arrayPool.push(array);
  }
}

module.exports = releaseArray;

},{"./arrayPool":20,"./maxPoolSize":41}],47:[function(_dereq_,module,exports){
/**
 * Lo-Dash 2.4.1 (Custom Build) <http://lodash.com/>
 * Build: `lodash modularize modern exports="node" -o ./modern/`
 * Copyright 2012-2013 The Dojo Foundation <http://dojofoundation.org/>
 * Based on Underscore.js 1.5.2 <http://underscorejs.org/LICENSE>
 * Copyright 2009-2013 Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
 * Available under MIT license <http://lodash.com/license>
 */
var maxPoolSize = _dereq_('./maxPoolSize'),
    objectPool = _dereq_('./objectPool');

/**
 * Releases the given object back to the object pool.
 *
 * @private
 * @param {Object} [object] The object to release.
 */
function releaseObject(object) {
  var cache = object.cache;
  if (cache) {
    releaseObject(cache);
  }
  object.array = object.cache = object.criteria = object.object = object.number = object.string = object.value = null;
  if (objectPool.length < maxPoolSize) {
    objectPool.push(object);
  }
}

module.exports = releaseObject;

},{"./maxPoolSize":41,"./objectPool":42}],48:[function(_dereq_,module,exports){
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

},{"../utilities/noop":70,"./isNative":38}],49:[function(_dereq_,module,exports){
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

},{"./objectTypes":43}],50:[function(_dereq_,module,exports){
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

},{}],51:[function(_dereq_,module,exports){
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

},{"../internals/baseCreateCallback":23,"../internals/objectTypes":43,"./keys":63}],52:[function(_dereq_,module,exports){
/**
 * Lo-Dash 2.4.1 (Custom Build) <http://lodash.com/>
 * Build: `lodash modularize modern exports="node" -o ./modern/`
 * Copyright 2012-2013 The Dojo Foundation <http://dojofoundation.org/>
 * Based on Underscore.js 1.5.2 <http://underscorejs.org/LICENSE>
 * Copyright 2009-2013 Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
 * Available under MIT license <http://lodash.com/license>
 */
var assign = _dereq_('./assign'),
    baseCreate = _dereq_('../internals/baseCreate');

/**
 * Creates an object that inherits from the given `prototype` object. If a
 * `properties` object is provided its own enumerable properties are assigned
 * to the created object.
 *
 * @static
 * @memberOf _
 * @category Objects
 * @param {Object} prototype The object to inherit from.
 * @param {Object} [properties] The properties to assign to the object.
 * @returns {Object} Returns the new object.
 * @example
 *
 * function Shape() {
 *   this.x = 0;
 *   this.y = 0;
 * }
 *
 * function Circle() {
 *   Shape.call(this);
 * }
 *
 * Circle.prototype = _.create(Shape.prototype, { 'constructor': Circle });
 *
 * var circle = new Circle;
 * circle instanceof Circle;
 * // => true
 *
 * circle instanceof Shape;
 * // => true
 */
function create(prototype, properties) {
  var result = baseCreate(prototype);
  return properties ? assign(result, properties) : result;
}

module.exports = create;

},{"../internals/baseCreate":22,"./assign":51}],53:[function(_dereq_,module,exports){
/**
 * Lo-Dash 2.4.1 (Custom Build) <http://lodash.com/>
 * Build: `lodash modularize modern exports="node" -o ./modern/`
 * Copyright 2012-2013 The Dojo Foundation <http://dojofoundation.org/>
 * Based on Underscore.js 1.5.2 <http://underscorejs.org/LICENSE>
 * Copyright 2009-2013 Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
 * Available under MIT license <http://lodash.com/license>
 */
var keys = _dereq_('./keys'),
    objectTypes = _dereq_('../internals/objectTypes');

/**
 * Assigns own enumerable properties of source object(s) to the destination
 * object for all destination properties that resolve to `undefined`. Once a
 * property is set, additional defaults of the same property will be ignored.
 *
 * @static
 * @memberOf _
 * @type Function
 * @category Objects
 * @param {Object} object The destination object.
 * @param {...Object} [source] The source objects.
 * @param- {Object} [guard] Allows working with `_.reduce` without using its
 *  `key` and `object` arguments as sources.
 * @returns {Object} Returns the destination object.
 * @example
 *
 * var object = { 'name': 'barney' };
 * _.defaults(object, { 'name': 'fred', 'employer': 'slate' });
 * // => { 'name': 'barney', 'employer': 'slate' }
 */
var defaults = function(object, source, guard) {
  var index, iterable = object, result = iterable;
  if (!iterable) return result;
  var args = arguments,
      argsIndex = 0,
      argsLength = typeof guard == 'number' ? 2 : args.length;
  while (++argsIndex < argsLength) {
    iterable = args[argsIndex];
    if (iterable && objectTypes[typeof iterable]) {
    var ownIndex = -1,
        ownProps = objectTypes[typeof iterable] && keys(iterable),
        length = ownProps ? ownProps.length : 0;

    while (++ownIndex < length) {
      index = ownProps[ownIndex];
      if (typeof result[index] == 'undefined') result[index] = iterable[index];
    }
    }
  }
  return result
};

module.exports = defaults;

},{"../internals/objectTypes":43,"./keys":63}],54:[function(_dereq_,module,exports){
/**
 * Lo-Dash 2.4.1 (Custom Build) <http://lodash.com/>
 * Build: `lodash modularize modern exports="node" -o ./modern/`
 * Copyright 2012-2013 The Dojo Foundation <http://dojofoundation.org/>
 * Based on Underscore.js 1.5.2 <http://underscorejs.org/LICENSE>
 * Copyright 2009-2013 Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
 * Available under MIT license <http://lodash.com/license>
 */
var baseCreateCallback = _dereq_('../internals/baseCreateCallback'),
    objectTypes = _dereq_('../internals/objectTypes');

/**
 * Iterates over own and inherited enumerable properties of an object,
 * executing the callback for each property. The callback is bound to `thisArg`
 * and invoked with three arguments; (value, key, object). Callbacks may exit
 * iteration early by explicitly returning `false`.
 *
 * @static
 * @memberOf _
 * @type Function
 * @category Objects
 * @param {Object} object The object to iterate over.
 * @param {Function} [callback=identity] The function called per iteration.
 * @param {*} [thisArg] The `this` binding of `callback`.
 * @returns {Object} Returns `object`.
 * @example
 *
 * function Shape() {
 *   this.x = 0;
 *   this.y = 0;
 * }
 *
 * Shape.prototype.move = function(x, y) {
 *   this.x += x;
 *   this.y += y;
 * };
 *
 * _.forIn(new Shape, function(value, key) {
 *   console.log(key);
 * });
 * // => logs 'x', 'y', and 'move' (property order is not guaranteed across environments)
 */
var forIn = function(collection, callback, thisArg) {
  var index, iterable = collection, result = iterable;
  if (!iterable) return result;
  if (!objectTypes[typeof iterable]) return result;
  callback = callback && typeof thisArg == 'undefined' ? callback : baseCreateCallback(callback, thisArg, 3);
    for (index in iterable) {
      if (callback(iterable[index], index, collection) === false) return result;
    }
  return result
};

module.exports = forIn;

},{"../internals/baseCreateCallback":23,"../internals/objectTypes":43}],55:[function(_dereq_,module,exports){
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
 * Iterates over own enumerable properties of an object, executing the callback
 * for each property. The callback is bound to `thisArg` and invoked with three
 * arguments; (value, key, object). Callbacks may exit iteration early by
 * explicitly returning `false`.
 *
 * @static
 * @memberOf _
 * @type Function
 * @category Objects
 * @param {Object} object The object to iterate over.
 * @param {Function} [callback=identity] The function called per iteration.
 * @param {*} [thisArg] The `this` binding of `callback`.
 * @returns {Object} Returns `object`.
 * @example
 *
 * _.forOwn({ '0': 'zero', '1': 'one', 'length': 2 }, function(num, key) {
 *   console.log(key);
 * });
 * // => logs '0', '1', and 'length' (property order is not guaranteed across environments)
 */
var forOwn = function(collection, callback, thisArg) {
  var index, iterable = collection, result = iterable;
  if (!iterable) return result;
  if (!objectTypes[typeof iterable]) return result;
  callback = callback && typeof thisArg == 'undefined' ? callback : baseCreateCallback(callback, thisArg, 3);
    var ownIndex = -1,
        ownProps = objectTypes[typeof iterable] && keys(iterable),
        length = ownProps ? ownProps.length : 0;

    while (++ownIndex < length) {
      index = ownProps[ownIndex];
      if (callback(iterable[index], index, collection) === false) return result;
    }
  return result
};

module.exports = forOwn;

},{"../internals/baseCreateCallback":23,"../internals/objectTypes":43,"./keys":63}],56:[function(_dereq_,module,exports){
/**
 * Lo-Dash 2.4.1 (Custom Build) <http://lodash.com/>
 * Build: `lodash modularize modern exports="node" -o ./modern/`
 * Copyright 2012-2013 The Dojo Foundation <http://dojofoundation.org/>
 * Based on Underscore.js 1.5.2 <http://underscorejs.org/LICENSE>
 * Copyright 2009-2013 Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
 * Available under MIT license <http://lodash.com/license>
 */
var forIn = _dereq_('./forIn'),
    isFunction = _dereq_('./isFunction');

/**
 * Creates a sorted array of property names of all enumerable properties,
 * own and inherited, of `object` that have function values.
 *
 * @static
 * @memberOf _
 * @alias methods
 * @category Objects
 * @param {Object} object The object to inspect.
 * @returns {Array} Returns an array of property names that have function values.
 * @example
 *
 * _.functions(_);
 * // => ['all', 'any', 'bind', 'bindAll', 'clone', 'compact', 'compose', ...]
 */
function functions(object) {
  var result = [];
  forIn(object, function(value, key) {
    if (isFunction(value)) {
      result.push(key);
    }
  });
  return result.sort();
}

module.exports = functions;

},{"./forIn":54,"./isFunction":60}],57:[function(_dereq_,module,exports){
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

/** Native method shortcuts */
var hasOwnProperty = objectProto.hasOwnProperty;

/**
 * Checks if the specified property name exists as a direct property of `object`,
 * instead of an inherited property.
 *
 * @static
 * @memberOf _
 * @category Objects
 * @param {Object} object The object to inspect.
 * @param {string} key The name of the property to check.
 * @returns {boolean} Returns `true` if key is a direct property, else `false`.
 * @example
 *
 * _.has({ 'a': 1, 'b': 2, 'c': 3 }, 'b');
 * // => true
 */
function has(object, key) {
  return object ? hasOwnProperty.call(object, key) : false;
}

module.exports = has;

},{}],58:[function(_dereq_,module,exports){
/**
 * Lo-Dash 2.4.1 (Custom Build) <http://lodash.com/>
 * Build: `lodash modularize modern exports="node" -o ./modern/`
 * Copyright 2012-2013 The Dojo Foundation <http://dojofoundation.org/>
 * Based on Underscore.js 1.5.2 <http://underscorejs.org/LICENSE>
 * Copyright 2009-2013 Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
 * Available under MIT license <http://lodash.com/license>
 */

/** `Object#toString` result shortcuts */
var argsClass = '[object Arguments]';

/** Used for native method references */
var objectProto = Object.prototype;

/** Used to resolve the internal [[Class]] of values */
var toString = objectProto.toString;

/**
 * Checks if `value` is an `arguments` object.
 *
 * @static
 * @memberOf _
 * @category Objects
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if the `value` is an `arguments` object, else `false`.
 * @example
 *
 * (function() { return _.isArguments(arguments); })(1, 2, 3);
 * // => true
 *
 * _.isArguments([1, 2, 3]);
 * // => false
 */
function isArguments(value) {
  return value && typeof value == 'object' && typeof value.length == 'number' &&
    toString.call(value) == argsClass || false;
}

module.exports = isArguments;

},{}],59:[function(_dereq_,module,exports){
/**
 * Lo-Dash 2.4.1 (Custom Build) <http://lodash.com/>
 * Build: `lodash modularize modern exports="node" -o ./modern/`
 * Copyright 2012-2013 The Dojo Foundation <http://dojofoundation.org/>
 * Based on Underscore.js 1.5.2 <http://underscorejs.org/LICENSE>
 * Copyright 2009-2013 Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
 * Available under MIT license <http://lodash.com/license>
 */
var isNative = _dereq_('../internals/isNative');

/** `Object#toString` result shortcuts */
var arrayClass = '[object Array]';

/** Used for native method references */
var objectProto = Object.prototype;

/** Used to resolve the internal [[Class]] of values */
var toString = objectProto.toString;

/* Native method shortcuts for methods with the same name as other `lodash` methods */
var nativeIsArray = isNative(nativeIsArray = Array.isArray) && nativeIsArray;

/**
 * Checks if `value` is an array.
 *
 * @static
 * @memberOf _
 * @type Function
 * @category Objects
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if the `value` is an array, else `false`.
 * @example
 *
 * (function() { return _.isArray(arguments); })();
 * // => false
 *
 * _.isArray([1, 2, 3]);
 * // => true
 */
var isArray = nativeIsArray || function(value) {
  return value && typeof value == 'object' && typeof value.length == 'number' &&
    toString.call(value) == arrayClass || false;
};

module.exports = isArray;

},{"../internals/isNative":38}],60:[function(_dereq_,module,exports){
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

},{}],61:[function(_dereq_,module,exports){
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

},{"../internals/objectTypes":43}],62:[function(_dereq_,module,exports){
/**
 * Lo-Dash 2.4.1 (Custom Build) <http://lodash.com/>
 * Build: `lodash modularize modern exports="node" -o ./modern/`
 * Copyright 2012-2013 The Dojo Foundation <http://dojofoundation.org/>
 * Based on Underscore.js 1.5.2 <http://underscorejs.org/LICENSE>
 * Copyright 2009-2013 Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
 * Available under MIT license <http://lodash.com/license>
 */

/** `Object#toString` result shortcuts */
var stringClass = '[object String]';

/** Used for native method references */
var objectProto = Object.prototype;

/** Used to resolve the internal [[Class]] of values */
var toString = objectProto.toString;

/**
 * Checks if `value` is a string.
 *
 * @static
 * @memberOf _
 * @category Objects
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if the `value` is a string, else `false`.
 * @example
 *
 * _.isString('fred');
 * // => true
 */
function isString(value) {
  return typeof value == 'string' ||
    value && typeof value == 'object' && toString.call(value) == stringClass || false;
}

module.exports = isString;

},{}],63:[function(_dereq_,module,exports){
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

},{"../internals/isNative":38,"../internals/shimKeys":49,"./isObject":61}],64:[function(_dereq_,module,exports){
/**
 * Lo-Dash 2.4.1 (Custom Build) <http://lodash.com/>
 * Build: `lodash modularize modern exports="node" -o ./modern/`
 * Copyright 2012-2013 The Dojo Foundation <http://dojofoundation.org/>
 * Based on Underscore.js 1.5.2 <http://underscorejs.org/LICENSE>
 * Copyright 2009-2013 Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
 * Available under MIT license <http://lodash.com/license>
 */
var baseDifference = _dereq_('../internals/baseDifference'),
    baseFlatten = _dereq_('../internals/baseFlatten'),
    createCallback = _dereq_('../functions/createCallback'),
    forIn = _dereq_('./forIn');

/**
 * Creates a shallow clone of `object` excluding the specified properties.
 * Property names may be specified as individual arguments or as arrays of
 * property names. If a callback is provided it will be executed for each
 * property of `object` omitting the properties the callback returns truey
 * for. The callback is bound to `thisArg` and invoked with three arguments;
 * (value, key, object).
 *
 * @static
 * @memberOf _
 * @category Objects
 * @param {Object} object The source object.
 * @param {Function|...string|string[]} [callback] The properties to omit or the
 *  function called per iteration.
 * @param {*} [thisArg] The `this` binding of `callback`.
 * @returns {Object} Returns an object without the omitted properties.
 * @example
 *
 * _.omit({ 'name': 'fred', 'age': 40 }, 'age');
 * // => { 'name': 'fred' }
 *
 * _.omit({ 'name': 'fred', 'age': 40 }, function(value) {
 *   return typeof value == 'number';
 * });
 * // => { 'name': 'fred' }
 */
function omit(object, callback, thisArg) {
  var result = {};
  if (typeof callback != 'function') {
    var props = [];
    forIn(object, function(value, key) {
      props.push(key);
    });
    props = baseDifference(props, baseFlatten(arguments, true, false, 1));

    var index = -1,
        length = props.length;

    while (++index < length) {
      var key = props[index];
      result[key] = object[key];
    }
  } else {
    callback = createCallback(callback, thisArg, 3);
    forIn(object, function(value, key, object) {
      if (!callback(value, key, object)) {
        result[key] = value;
      }
    });
  }
  return result;
}

module.exports = omit;

},{"../functions/createCallback":18,"../internals/baseDifference":25,"../internals/baseFlatten":26,"./forIn":54}],65:[function(_dereq_,module,exports){
/**
 * Lo-Dash 2.4.1 (Custom Build) <http://lodash.com/>
 * Build: `lodash modularize modern exports="node" -o ./modern/`
 * Copyright 2012-2013 The Dojo Foundation <http://dojofoundation.org/>
 * Based on Underscore.js 1.5.2 <http://underscorejs.org/LICENSE>
 * Copyright 2009-2013 Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
 * Available under MIT license <http://lodash.com/license>
 */
var baseFlatten = _dereq_('../internals/baseFlatten'),
    createCallback = _dereq_('../functions/createCallback'),
    forIn = _dereq_('./forIn'),
    isObject = _dereq_('./isObject');

/**
 * Creates a shallow clone of `object` composed of the specified properties.
 * Property names may be specified as individual arguments or as arrays of
 * property names. If a callback is provided it will be executed for each
 * property of `object` picking the properties the callback returns truey
 * for. The callback is bound to `thisArg` and invoked with three arguments;
 * (value, key, object).
 *
 * @static
 * @memberOf _
 * @category Objects
 * @param {Object} object The source object.
 * @param {Function|...string|string[]} [callback] The function called per
 *  iteration or property names to pick, specified as individual property
 *  names or arrays of property names.
 * @param {*} [thisArg] The `this` binding of `callback`.
 * @returns {Object} Returns an object composed of the picked properties.
 * @example
 *
 * _.pick({ 'name': 'fred', '_userid': 'fred1' }, 'name');
 * // => { 'name': 'fred' }
 *
 * _.pick({ 'name': 'fred', '_userid': 'fred1' }, function(value, key) {
 *   return key.charAt(0) != '_';
 * });
 * // => { 'name': 'fred' }
 */
function pick(object, callback, thisArg) {
  var result = {};
  if (typeof callback != 'function') {
    var index = -1,
        props = baseFlatten(arguments, true, false, 1),
        length = isObject(object) ? props.length : 0;

    while (++index < length) {
      var key = props[index];
      if (key in object) {
        result[key] = object[key];
      }
    }
  } else {
    callback = createCallback(callback, thisArg, 3);
    forIn(object, function(value, key, object) {
      if (callback(value, key, object)) {
        result[key] = value;
      }
    });
  }
  return result;
}

module.exports = pick;

},{"../functions/createCallback":18,"../internals/baseFlatten":26,"./forIn":54,"./isObject":61}],66:[function(_dereq_,module,exports){
/**
 * Lo-Dash 2.4.1 (Custom Build) <http://lodash.com/>
 * Build: `lodash modularize modern exports="node" -o ./modern/`
 * Copyright 2012-2013 The Dojo Foundation <http://dojofoundation.org/>
 * Based on Underscore.js 1.5.2 <http://underscorejs.org/LICENSE>
 * Copyright 2009-2013 Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
 * Available under MIT license <http://lodash.com/license>
 */
var keys = _dereq_('./keys');

/**
 * Creates an array composed of the own enumerable property values of `object`.
 *
 * @static
 * @memberOf _
 * @category Objects
 * @param {Object} object The object to inspect.
 * @returns {Array} Returns an array of property values.
 * @example
 *
 * _.values({ 'one': 1, 'two': 2, 'three': 3 });
 * // => [1, 2, 3] (property order is not guaranteed across environments)
 */
function values(object) {
  var index = -1,
      props = keys(object),
      length = props.length,
      result = Array(length);

  while (++index < length) {
    result[index] = object[props[index]];
  }
  return result;
}

module.exports = values;

},{"./keys":63}],67:[function(_dereq_,module,exports){
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
},{"./internals/isNative":38}],68:[function(_dereq_,module,exports){
/**
 * Lo-Dash 2.4.1 (Custom Build) <http://lodash.com/>
 * Build: `lodash modularize modern exports="node" -o ./modern/`
 * Copyright 2012-2013 The Dojo Foundation <http://dojofoundation.org/>
 * Based on Underscore.js 1.5.2 <http://underscorejs.org/LICENSE>
 * Copyright 2009-2013 Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
 * Available under MIT license <http://lodash.com/license>
 */
var escapeHtmlChar = _dereq_('../internals/escapeHtmlChar'),
    keys = _dereq_('../objects/keys'),
    reUnescapedHtml = _dereq_('../internals/reUnescapedHtml');

/**
 * Converts the characters `&`, `<`, `>`, `"`, and `'` in `string` to their
 * corresponding HTML entities.
 *
 * @static
 * @memberOf _
 * @category Utilities
 * @param {string} string The string to escape.
 * @returns {string} Returns the escaped string.
 * @example
 *
 * _.escape('Fred, Wilma, & Pebbles');
 * // => 'Fred, Wilma, &amp; Pebbles'
 */
function escape(string) {
  return string == null ? '' : String(string).replace(reUnescapedHtml, escapeHtmlChar);
}

module.exports = escape;

},{"../internals/escapeHtmlChar":33,"../internals/reUnescapedHtml":45,"../objects/keys":63}],69:[function(_dereq_,module,exports){
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

},{}],70:[function(_dereq_,module,exports){
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

},{}],71:[function(_dereq_,module,exports){
/**
 * Lo-Dash 2.4.1 (Custom Build) <http://lodash.com/>
 * Build: `lodash modularize modern exports="node" -o ./modern/`
 * Copyright 2012-2013 The Dojo Foundation <http://dojofoundation.org/>
 * Based on Underscore.js 1.5.2 <http://underscorejs.org/LICENSE>
 * Copyright 2009-2013 Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
 * Available under MIT license <http://lodash.com/license>
 */

/**
 * Creates a "_.pluck" style function, which returns the `key` value of a
 * given object.
 *
 * @static
 * @memberOf _
 * @category Utilities
 * @param {string} key The name of the property to retrieve.
 * @returns {Function} Returns the new function.
 * @example
 *
 * var characters = [
 *   { 'name': 'fred',   'age': 40 },
 *   { 'name': 'barney', 'age': 36 }
 * ];
 *
 * var getName = _.property('name');
 *
 * _.map(characters, getName);
 * // => ['barney', 'fred']
 *
 * _.sortBy(characters, getName);
 * // => [{ 'name': 'barney', 'age': 36 }, { 'name': 'fred',   'age': 40 }]
 */
function property(key) {
  return function(object) {
    return object[key];
  };
}

module.exports = property;

},{}],72:[function(_dereq_,module,exports){
/**
 * Lo-Dash 2.4.1 (Custom Build) <http://lodash.com/>
 * Build: `lodash modularize modern exports="node" -o ./modern/`
 * Copyright 2012-2013 The Dojo Foundation <http://dojofoundation.org/>
 * Based on Underscore.js 1.5.2 <http://underscorejs.org/LICENSE>
 * Copyright 2009-2013 Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
 * Available under MIT license <http://lodash.com/license>
 */
var isFunction = _dereq_('../objects/isFunction');

/**
 * Resolves the value of property `key` on `object`. If `key` is a function
 * it will be invoked with the `this` binding of `object` and its result returned,
 * else the property value is returned. If `object` is falsey then `undefined`
 * is returned.
 *
 * @static
 * @memberOf _
 * @category Utilities
 * @param {Object} object The object to inspect.
 * @param {string} key The name of the property to resolve.
 * @returns {*} Returns the resolved value.
 * @example
 *
 * var object = {
 *   'cheese': 'crumpets',
 *   'stuff': function() {
 *     return 'nonsense';
 *   }
 * };
 *
 * _.result(object, 'cheese');
 * // => 'crumpets'
 *
 * _.result(object, 'stuff');
 * // => 'nonsense'
 */
function result(object, key) {
  if (object) {
    var value = object[key];
    return isFunction(value) ? object[key]() : value;
  }
}

module.exports = result;

},{"../objects/isFunction":60}],73:[function(_dereq_,module,exports){
/**
 * Lo-Dash 2.4.1 (Custom Build) <http://lodash.com/>
 * Build: `lodash modularize modern exports="node" -o ./modern/`
 * Copyright 2012-2013 The Dojo Foundation <http://dojofoundation.org/>
 * Based on Underscore.js 1.5.2 <http://underscorejs.org/LICENSE>
 * Copyright 2009-2013 Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
 * Available under MIT license <http://lodash.com/license>
 */
var defaults = _dereq_('../objects/defaults'),
    escape = _dereq_('./escape'),
    escapeStringChar = _dereq_('../internals/escapeStringChar'),
    keys = _dereq_('../objects/keys'),
    reInterpolate = _dereq_('../internals/reInterpolate'),
    templateSettings = _dereq_('./templateSettings'),
    values = _dereq_('../objects/values');

/** Used to match empty string literals in compiled template source */
var reEmptyStringLeading = /\b__p \+= '';/g,
    reEmptyStringMiddle = /\b(__p \+=) '' \+/g,
    reEmptyStringTrailing = /(__e\(.*?\)|\b__t\)) \+\n'';/g;

/**
 * Used to match ES6 template delimiters
 * http://people.mozilla.org/~jorendorff/es6-draft.html#sec-literals-string-literals
 */
var reEsTemplate = /\$\{([^\\}]*(?:\\.[^\\}]*)*)\}/g;

/** Used to ensure capturing order of template delimiters */
var reNoMatch = /($^)/;

/** Used to match unescaped characters in compiled string literals */
var reUnescapedString = /['\n\r\t\u2028\u2029\\]/g;

/**
 * A micro-templating method that handles arbitrary delimiters, preserves
 * whitespace, and correctly escapes quotes within interpolated code.
 *
 * Note: In the development build, `_.template` utilizes sourceURLs for easier
 * debugging. See http://www.html5rocks.com/en/tutorials/developertools/sourcemaps/#toc-sourceurl
 *
 * For more information on precompiling templates see:
 * http://lodash.com/custom-builds
 *
 * For more information on Chrome extension sandboxes see:
 * http://developer.chrome.com/stable/extensions/sandboxingEval.html
 *
 * @static
 * @memberOf _
 * @category Utilities
 * @param {string} text The template text.
 * @param {Object} data The data object used to populate the text.
 * @param {Object} [options] The options object.
 * @param {RegExp} [options.escape] The "escape" delimiter.
 * @param {RegExp} [options.evaluate] The "evaluate" delimiter.
 * @param {Object} [options.imports] An object to import into the template as local variables.
 * @param {RegExp} [options.interpolate] The "interpolate" delimiter.
 * @param {string} [sourceURL] The sourceURL of the template's compiled source.
 * @param {string} [variable] The data object variable name.
 * @returns {Function|string} Returns a compiled function when no `data` object
 *  is given, else it returns the interpolated text.
 * @example
 *
 * // using the "interpolate" delimiter to create a compiled template
 * var compiled = _.template('hello <%= name %>');
 * compiled({ 'name': 'fred' });
 * // => 'hello fred'
 *
 * // using the "escape" delimiter to escape HTML in data property values
 * _.template('<b><%- value %></b>', { 'value': '<script>' });
 * // => '<b>&lt;script&gt;</b>'
 *
 * // using the "evaluate" delimiter to generate HTML
 * var list = '<% _.forEach(people, function(name) { %><li><%- name %></li><% }); %>';
 * _.template(list, { 'people': ['fred', 'barney'] });
 * // => '<li>fred</li><li>barney</li>'
 *
 * // using the ES6 delimiter as an alternative to the default "interpolate" delimiter
 * _.template('hello ${ name }', { 'name': 'pebbles' });
 * // => 'hello pebbles'
 *
 * // using the internal `print` function in "evaluate" delimiters
 * _.template('<% print("hello " + name); %>!', { 'name': 'barney' });
 * // => 'hello barney!'
 *
 * // using a custom template delimiters
 * _.templateSettings = {
 *   'interpolate': /{{([\s\S]+?)}}/g
 * };
 *
 * _.template('hello {{ name }}!', { 'name': 'mustache' });
 * // => 'hello mustache!'
 *
 * // using the `imports` option to import jQuery
 * var list = '<% jq.each(people, function(name) { %><li><%- name %></li><% }); %>';
 * _.template(list, { 'people': ['fred', 'barney'] }, { 'imports': { 'jq': jQuery } });
 * // => '<li>fred</li><li>barney</li>'
 *
 * // using the `sourceURL` option to specify a custom sourceURL for the template
 * var compiled = _.template('hello <%= name %>', null, { 'sourceURL': '/basic/greeting.jst' });
 * compiled(data);
 * // => find the source of "greeting.jst" under the Sources tab or Resources panel of the web inspector
 *
 * // using the `variable` option to ensure a with-statement isn't used in the compiled template
 * var compiled = _.template('hi <%= data.name %>!', null, { 'variable': 'data' });
 * compiled.source;
 * // => function(data) {
 *   var __t, __p = '', __e = _.escape;
 *   __p += 'hi ' + ((__t = ( data.name )) == null ? '' : __t) + '!';
 *   return __p;
 * }
 *
 * // using the `source` property to inline compiled templates for meaningful
 * // line numbers in error messages and a stack trace
 * fs.writeFileSync(path.join(cwd, 'jst.js'), '\
 *   var JST = {\
 *     "main": ' + _.template(mainText).source + '\
 *   };\
 * ');
 */
function template(text, data, options) {
  // based on John Resig's `tmpl` implementation
  // http://ejohn.org/blog/javascript-micro-templating/
  // and Laura Doktorova's doT.js
  // https://github.com/olado/doT
  var settings = templateSettings.imports._.templateSettings || templateSettings;
  text = String(text || '');

  // avoid missing dependencies when `iteratorTemplate` is not defined
  options = defaults({}, options, settings);

  var imports = defaults({}, options.imports, settings.imports),
      importsKeys = keys(imports),
      importsValues = values(imports);

  var isEvaluating,
      index = 0,
      interpolate = options.interpolate || reNoMatch,
      source = "__p += '";

  // compile the regexp to match each delimiter
  var reDelimiters = RegExp(
    (options.escape || reNoMatch).source + '|' +
    interpolate.source + '|' +
    (interpolate === reInterpolate ? reEsTemplate : reNoMatch).source + '|' +
    (options.evaluate || reNoMatch).source + '|$'
  , 'g');

  text.replace(reDelimiters, function(match, escapeValue, interpolateValue, esTemplateValue, evaluateValue, offset) {
    interpolateValue || (interpolateValue = esTemplateValue);

    // escape characters that cannot be included in string literals
    source += text.slice(index, offset).replace(reUnescapedString, escapeStringChar);

    // replace delimiters with snippets
    if (escapeValue) {
      source += "' +\n__e(" + escapeValue + ") +\n'";
    }
    if (evaluateValue) {
      isEvaluating = true;
      source += "';\n" + evaluateValue + ";\n__p += '";
    }
    if (interpolateValue) {
      source += "' +\n((__t = (" + interpolateValue + ")) == null ? '' : __t) +\n'";
    }
    index = offset + match.length;

    // the JS engine embedded in Adobe products requires returning the `match`
    // string in order to produce the correct `offset` value
    return match;
  });

  source += "';\n";

  // if `variable` is not specified, wrap a with-statement around the generated
  // code to add the data object to the top of the scope chain
  var variable = options.variable,
      hasVariable = variable;

  if (!hasVariable) {
    variable = 'obj';
    source = 'with (' + variable + ') {\n' + source + '\n}\n';
  }
  // cleanup code by stripping empty strings
  source = (isEvaluating ? source.replace(reEmptyStringLeading, '') : source)
    .replace(reEmptyStringMiddle, '$1')
    .replace(reEmptyStringTrailing, '$1;');

  // frame code as the function body
  source = 'function(' + variable + ') {\n' +
    (hasVariable ? '' : variable + ' || (' + variable + ' = {});\n') +
    "var __t, __p = '', __e = _.escape" +
    (isEvaluating
      ? ', __j = Array.prototype.join;\n' +
        "function print() { __p += __j.call(arguments, '') }\n"
      : ';\n'
    ) +
    source +
    'return __p\n}';

  try {
    var result = Function(importsKeys, 'return ' + source ).apply(undefined, importsValues);
  } catch(e) {
    e.source = source;
    throw e;
  }
  if (data) {
    return result(data);
  }
  // provide the compiled function's source by its `toString` method, in
  // supported environments, or the `source` property as a convenience for
  // inlining compiled templates during the build process
  result.source = source;
  return result;
}

module.exports = template;

},{"../internals/escapeStringChar":34,"../internals/reInterpolate":44,"../objects/defaults":53,"../objects/keys":63,"../objects/values":66,"./escape":68,"./templateSettings":74}],74:[function(_dereq_,module,exports){
/**
 * Lo-Dash 2.4.1 (Custom Build) <http://lodash.com/>
 * Build: `lodash modularize modern exports="node" -o ./modern/`
 * Copyright 2012-2013 The Dojo Foundation <http://dojofoundation.org/>
 * Based on Underscore.js 1.5.2 <http://underscorejs.org/LICENSE>
 * Copyright 2009-2013 Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
 * Available under MIT license <http://lodash.com/license>
 */
var escape = _dereq_('./escape'),
    reInterpolate = _dereq_('../internals/reInterpolate');

/**
 * By default, the template delimiters used by Lo-Dash are similar to those in
 * embedded Ruby (ERB). Change the following template settings to use alternative
 * delimiters.
 *
 * @static
 * @memberOf _
 * @type Object
 */
var templateSettings = {

  /**
   * Used to detect `data` property values to be HTML-escaped.
   *
   * @memberOf _.templateSettings
   * @type RegExp
   */
  'escape': /<%-([\s\S]+?)%>/g,

  /**
   * Used to detect code to be evaluated.
   *
   * @memberOf _.templateSettings
   * @type RegExp
   */
  'evaluate': /<%([\s\S]+?)%>/g,

  /**
   * Used to detect `data` property values to inject.
   *
   * @memberOf _.templateSettings
   * @type RegExp
   */
  'interpolate': reInterpolate,

  /**
   * Used to reference the data object in the template text.
   *
   * @memberOf _.templateSettings
   * @type string
   */
  'variable': '',

  /**
   * Used to import variables into the compiled template.
   *
   * @memberOf _.templateSettings
   * @type Object
   */
  'imports': {

    /**
     * A reference to the `lodash` function.
     *
     * @memberOf _.templateSettings.imports
     * @type Function
     */
    '_': { 'escape': escape }
  }
};

module.exports = templateSettings;

},{"../internals/reInterpolate":44,"./escape":68}],75:[function(_dereq_,module,exports){
/**
 * Lo-Dash 2.4.1 (Custom Build) <http://lodash.com/>
 * Build: `lodash modularize modern exports="node" -o ./modern/`
 * Copyright 2012-2013 The Dojo Foundation <http://dojofoundation.org/>
 * Based on Underscore.js 1.5.2 <http://underscorejs.org/LICENSE>
 * Copyright 2009-2013 Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
 * Available under MIT license <http://lodash.com/license>
 */

/** Used to generate unique IDs */
var idCounter = 0;

/**
 * Generates a unique ID. If `prefix` is provided the ID will be appended to it.
 *
 * @static
 * @memberOf _
 * @category Utilities
 * @param {string} [prefix] The value to prefix the ID with.
 * @returns {string} Returns the unique ID.
 * @example
 *
 * _.uniqueId('contact_');
 * // => 'contact_104'
 *
 * _.uniqueId();
 * // => '105'
 */
function uniqueId(prefix) {
  var id = ++idCounter;
  return String(prefix == null ? '' : prefix) + id;
}

module.exports = uniqueId;

},{}]},{},[3])
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlcyI6WyIvVXNlcnMvYWRhbS9Eb2N1bWVudHMvd29ya3NwYWNlL3BlcnNvbmFsL3NlY3Rvci9ub2RlX21vZHVsZXMvYnJvd3NlcmlmeS9ub2RlX21vZHVsZXMvYnJvd3Nlci1wYWNrL19wcmVsdWRlLmpzIiwiL1VzZXJzL2FkYW0vRG9jdW1lbnRzL3dvcmtzcGFjZS9wZXJzb25hbC9zZWN0b3IvbGliL2NvbXBvbmVudC5qcyIsIi9Vc2Vycy9hZGFtL0RvY3VtZW50cy93b3Jrc3BhY2UvcGVyc29uYWwvc2VjdG9yL2xpYi9jb21wb25lbnRzL3JvdXRlci5qcyIsIi9Vc2Vycy9hZGFtL0RvY3VtZW50cy93b3Jrc3BhY2UvcGVyc29uYWwvc2VjdG9yL2xpYi9pbmRleC5qcyIsIi9Vc2Vycy9hZGFtL0RvY3VtZW50cy93b3Jrc3BhY2UvcGVyc29uYWwvc2VjdG9yL2xpYi9taXhpbnMvaG9va2VkLmpzIiwiL1VzZXJzL2FkYW0vRG9jdW1lbnRzL3dvcmtzcGFjZS9wZXJzb25hbC9zZWN0b3IvbGliL21peGlucy9saXN0ZW5lci5qcyIsIi9Vc2Vycy9hZGFtL0RvY3VtZW50cy93b3Jrc3BhY2UvcGVyc29uYWwvc2VjdG9yL2xpYi9taXhpbnMvcHVic3ViLmpzIiwiL1VzZXJzL2FkYW0vRG9jdW1lbnRzL3dvcmtzcGFjZS9wZXJzb25hbC9zZWN0b3IvbGliL21peGlucy90cmFjZWFibGUuanMiLCIvVXNlcnMvYWRhbS9Eb2N1bWVudHMvd29ya3NwYWNlL3BlcnNvbmFsL3NlY3Rvci9saWIvbWl4aW5zL3ZpZXcuanMiLCIvVXNlcnMvYWRhbS9Eb2N1bWVudHMvd29ya3NwYWNlL3BlcnNvbmFsL3NlY3Rvci9saWIvcmVnaXN0cnkuanMiLCIvVXNlcnMvYWRhbS9Eb2N1bWVudHMvd29ya3NwYWNlL3BlcnNvbmFsL3NlY3Rvci9saWIvdXRpbHMtZXh0LWdsb2JhbC5qcyIsIi9Vc2Vycy9hZGFtL0RvY3VtZW50cy93b3Jrc3BhY2UvcGVyc29uYWwvc2VjdG9yL2xpYi91dGlscy1leHQtcmVxdWlyZS5qcyIsIi9Vc2Vycy9hZGFtL0RvY3VtZW50cy93b3Jrc3BhY2UvcGVyc29uYWwvc2VjdG9yL2xpYi91dGlscy5qcyIsIi9Vc2Vycy9hZGFtL0RvY3VtZW50cy93b3Jrc3BhY2UvcGVyc29uYWwvc2VjdG9yL25vZGVfbW9kdWxlcy9kb21pZnkvaW5kZXguanMiLCIvVXNlcnMvYWRhbS9Eb2N1bWVudHMvd29ya3NwYWNlL3BlcnNvbmFsL3NlY3Rvci9ub2RlX21vZHVsZXMvbG9kYXNoLW5vZGUvbW9kZXJuL2NvbGxlY3Rpb25zL2ZvckVhY2guanMiLCIvVXNlcnMvYWRhbS9Eb2N1bWVudHMvd29ya3NwYWNlL3BlcnNvbmFsL3NlY3Rvci9ub2RlX21vZHVsZXMvbG9kYXNoLW5vZGUvbW9kZXJuL2NvbGxlY3Rpb25zL21hcC5qcyIsIi9Vc2Vycy9hZGFtL0RvY3VtZW50cy93b3Jrc3BhY2UvcGVyc29uYWwvc2VjdG9yL25vZGVfbW9kdWxlcy9sb2Rhc2gtbm9kZS9tb2Rlcm4vZnVuY3Rpb25zL2JpbmQuanMiLCIvVXNlcnMvYWRhbS9Eb2N1bWVudHMvd29ya3NwYWNlL3BlcnNvbmFsL3NlY3Rvci9ub2RlX21vZHVsZXMvbG9kYXNoLW5vZGUvbW9kZXJuL2Z1bmN0aW9ucy9iaW5kQWxsLmpzIiwiL1VzZXJzL2FkYW0vRG9jdW1lbnRzL3dvcmtzcGFjZS9wZXJzb25hbC9zZWN0b3Ivbm9kZV9tb2R1bGVzL2xvZGFzaC1ub2RlL21vZGVybi9mdW5jdGlvbnMvY3JlYXRlQ2FsbGJhY2suanMiLCIvVXNlcnMvYWRhbS9Eb2N1bWVudHMvd29ya3NwYWNlL3BlcnNvbmFsL3NlY3Rvci9ub2RlX21vZHVsZXMvbG9kYXNoLW5vZGUvbW9kZXJuL2Z1bmN0aW9ucy93cmFwLmpzIiwiL1VzZXJzL2FkYW0vRG9jdW1lbnRzL3dvcmtzcGFjZS9wZXJzb25hbC9zZWN0b3Ivbm9kZV9tb2R1bGVzL2xvZGFzaC1ub2RlL21vZGVybi9pbnRlcm5hbHMvYXJyYXlQb29sLmpzIiwiL1VzZXJzL2FkYW0vRG9jdW1lbnRzL3dvcmtzcGFjZS9wZXJzb25hbC9zZWN0b3Ivbm9kZV9tb2R1bGVzL2xvZGFzaC1ub2RlL21vZGVybi9pbnRlcm5hbHMvYmFzZUJpbmQuanMiLCIvVXNlcnMvYWRhbS9Eb2N1bWVudHMvd29ya3NwYWNlL3BlcnNvbmFsL3NlY3Rvci9ub2RlX21vZHVsZXMvbG9kYXNoLW5vZGUvbW9kZXJuL2ludGVybmFscy9iYXNlQ3JlYXRlLmpzIiwiL1VzZXJzL2FkYW0vRG9jdW1lbnRzL3dvcmtzcGFjZS9wZXJzb25hbC9zZWN0b3Ivbm9kZV9tb2R1bGVzL2xvZGFzaC1ub2RlL21vZGVybi9pbnRlcm5hbHMvYmFzZUNyZWF0ZUNhbGxiYWNrLmpzIiwiL1VzZXJzL2FkYW0vRG9jdW1lbnRzL3dvcmtzcGFjZS9wZXJzb25hbC9zZWN0b3Ivbm9kZV9tb2R1bGVzL2xvZGFzaC1ub2RlL21vZGVybi9pbnRlcm5hbHMvYmFzZUNyZWF0ZVdyYXBwZXIuanMiLCIvVXNlcnMvYWRhbS9Eb2N1bWVudHMvd29ya3NwYWNlL3BlcnNvbmFsL3NlY3Rvci9ub2RlX21vZHVsZXMvbG9kYXNoLW5vZGUvbW9kZXJuL2ludGVybmFscy9iYXNlRGlmZmVyZW5jZS5qcyIsIi9Vc2Vycy9hZGFtL0RvY3VtZW50cy93b3Jrc3BhY2UvcGVyc29uYWwvc2VjdG9yL25vZGVfbW9kdWxlcy9sb2Rhc2gtbm9kZS9tb2Rlcm4vaW50ZXJuYWxzL2Jhc2VGbGF0dGVuLmpzIiwiL1VzZXJzL2FkYW0vRG9jdW1lbnRzL3dvcmtzcGFjZS9wZXJzb25hbC9zZWN0b3Ivbm9kZV9tb2R1bGVzL2xvZGFzaC1ub2RlL21vZGVybi9pbnRlcm5hbHMvYmFzZUluZGV4T2YuanMiLCIvVXNlcnMvYWRhbS9Eb2N1bWVudHMvd29ya3NwYWNlL3BlcnNvbmFsL3NlY3Rvci9ub2RlX21vZHVsZXMvbG9kYXNoLW5vZGUvbW9kZXJuL2ludGVybmFscy9iYXNlSXNFcXVhbC5qcyIsIi9Vc2Vycy9hZGFtL0RvY3VtZW50cy93b3Jrc3BhY2UvcGVyc29uYWwvc2VjdG9yL25vZGVfbW9kdWxlcy9sb2Rhc2gtbm9kZS9tb2Rlcm4vaW50ZXJuYWxzL2NhY2hlSW5kZXhPZi5qcyIsIi9Vc2Vycy9hZGFtL0RvY3VtZW50cy93b3Jrc3BhY2UvcGVyc29uYWwvc2VjdG9yL25vZGVfbW9kdWxlcy9sb2Rhc2gtbm9kZS9tb2Rlcm4vaW50ZXJuYWxzL2NhY2hlUHVzaC5qcyIsIi9Vc2Vycy9hZGFtL0RvY3VtZW50cy93b3Jrc3BhY2UvcGVyc29uYWwvc2VjdG9yL25vZGVfbW9kdWxlcy9sb2Rhc2gtbm9kZS9tb2Rlcm4vaW50ZXJuYWxzL2NyZWF0ZUNhY2hlLmpzIiwiL1VzZXJzL2FkYW0vRG9jdW1lbnRzL3dvcmtzcGFjZS9wZXJzb25hbC9zZWN0b3Ivbm9kZV9tb2R1bGVzL2xvZGFzaC1ub2RlL21vZGVybi9pbnRlcm5hbHMvY3JlYXRlV3JhcHBlci5qcyIsIi9Vc2Vycy9hZGFtL0RvY3VtZW50cy93b3Jrc3BhY2UvcGVyc29uYWwvc2VjdG9yL25vZGVfbW9kdWxlcy9sb2Rhc2gtbm9kZS9tb2Rlcm4vaW50ZXJuYWxzL2VzY2FwZUh0bWxDaGFyLmpzIiwiL1VzZXJzL2FkYW0vRG9jdW1lbnRzL3dvcmtzcGFjZS9wZXJzb25hbC9zZWN0b3Ivbm9kZV9tb2R1bGVzL2xvZGFzaC1ub2RlL21vZGVybi9pbnRlcm5hbHMvZXNjYXBlU3RyaW5nQ2hhci5qcyIsIi9Vc2Vycy9hZGFtL0RvY3VtZW50cy93b3Jrc3BhY2UvcGVyc29uYWwvc2VjdG9yL25vZGVfbW9kdWxlcy9sb2Rhc2gtbm9kZS9tb2Rlcm4vaW50ZXJuYWxzL2dldEFycmF5LmpzIiwiL1VzZXJzL2FkYW0vRG9jdW1lbnRzL3dvcmtzcGFjZS9wZXJzb25hbC9zZWN0b3Ivbm9kZV9tb2R1bGVzL2xvZGFzaC1ub2RlL21vZGVybi9pbnRlcm5hbHMvZ2V0T2JqZWN0LmpzIiwiL1VzZXJzL2FkYW0vRG9jdW1lbnRzL3dvcmtzcGFjZS9wZXJzb25hbC9zZWN0b3Ivbm9kZV9tb2R1bGVzL2xvZGFzaC1ub2RlL21vZGVybi9pbnRlcm5hbHMvaHRtbEVzY2FwZXMuanMiLCIvVXNlcnMvYWRhbS9Eb2N1bWVudHMvd29ya3NwYWNlL3BlcnNvbmFsL3NlY3Rvci9ub2RlX21vZHVsZXMvbG9kYXNoLW5vZGUvbW9kZXJuL2ludGVybmFscy9pc05hdGl2ZS5qcyIsIi9Vc2Vycy9hZGFtL0RvY3VtZW50cy93b3Jrc3BhY2UvcGVyc29uYWwvc2VjdG9yL25vZGVfbW9kdWxlcy9sb2Rhc2gtbm9kZS9tb2Rlcm4vaW50ZXJuYWxzL2tleVByZWZpeC5qcyIsIi9Vc2Vycy9hZGFtL0RvY3VtZW50cy93b3Jrc3BhY2UvcGVyc29uYWwvc2VjdG9yL25vZGVfbW9kdWxlcy9sb2Rhc2gtbm9kZS9tb2Rlcm4vaW50ZXJuYWxzL2xhcmdlQXJyYXlTaXplLmpzIiwiL1VzZXJzL2FkYW0vRG9jdW1lbnRzL3dvcmtzcGFjZS9wZXJzb25hbC9zZWN0b3Ivbm9kZV9tb2R1bGVzL2xvZGFzaC1ub2RlL21vZGVybi9pbnRlcm5hbHMvbWF4UG9vbFNpemUuanMiLCIvVXNlcnMvYWRhbS9Eb2N1bWVudHMvd29ya3NwYWNlL3BlcnNvbmFsL3NlY3Rvci9ub2RlX21vZHVsZXMvbG9kYXNoLW5vZGUvbW9kZXJuL2ludGVybmFscy9vYmplY3RQb29sLmpzIiwiL1VzZXJzL2FkYW0vRG9jdW1lbnRzL3dvcmtzcGFjZS9wZXJzb25hbC9zZWN0b3Ivbm9kZV9tb2R1bGVzL2xvZGFzaC1ub2RlL21vZGVybi9pbnRlcm5hbHMvb2JqZWN0VHlwZXMuanMiLCIvVXNlcnMvYWRhbS9Eb2N1bWVudHMvd29ya3NwYWNlL3BlcnNvbmFsL3NlY3Rvci9ub2RlX21vZHVsZXMvbG9kYXNoLW5vZGUvbW9kZXJuL2ludGVybmFscy9yZUludGVycG9sYXRlLmpzIiwiL1VzZXJzL2FkYW0vRG9jdW1lbnRzL3dvcmtzcGFjZS9wZXJzb25hbC9zZWN0b3Ivbm9kZV9tb2R1bGVzL2xvZGFzaC1ub2RlL21vZGVybi9pbnRlcm5hbHMvcmVVbmVzY2FwZWRIdG1sLmpzIiwiL1VzZXJzL2FkYW0vRG9jdW1lbnRzL3dvcmtzcGFjZS9wZXJzb25hbC9zZWN0b3Ivbm9kZV9tb2R1bGVzL2xvZGFzaC1ub2RlL21vZGVybi9pbnRlcm5hbHMvcmVsZWFzZUFycmF5LmpzIiwiL1VzZXJzL2FkYW0vRG9jdW1lbnRzL3dvcmtzcGFjZS9wZXJzb25hbC9zZWN0b3Ivbm9kZV9tb2R1bGVzL2xvZGFzaC1ub2RlL21vZGVybi9pbnRlcm5hbHMvcmVsZWFzZU9iamVjdC5qcyIsIi9Vc2Vycy9hZGFtL0RvY3VtZW50cy93b3Jrc3BhY2UvcGVyc29uYWwvc2VjdG9yL25vZGVfbW9kdWxlcy9sb2Rhc2gtbm9kZS9tb2Rlcm4vaW50ZXJuYWxzL3NldEJpbmREYXRhLmpzIiwiL1VzZXJzL2FkYW0vRG9jdW1lbnRzL3dvcmtzcGFjZS9wZXJzb25hbC9zZWN0b3Ivbm9kZV9tb2R1bGVzL2xvZGFzaC1ub2RlL21vZGVybi9pbnRlcm5hbHMvc2hpbUtleXMuanMiLCIvVXNlcnMvYWRhbS9Eb2N1bWVudHMvd29ya3NwYWNlL3BlcnNvbmFsL3NlY3Rvci9ub2RlX21vZHVsZXMvbG9kYXNoLW5vZGUvbW9kZXJuL2ludGVybmFscy9zbGljZS5qcyIsIi9Vc2Vycy9hZGFtL0RvY3VtZW50cy93b3Jrc3BhY2UvcGVyc29uYWwvc2VjdG9yL25vZGVfbW9kdWxlcy9sb2Rhc2gtbm9kZS9tb2Rlcm4vb2JqZWN0cy9hc3NpZ24uanMiLCIvVXNlcnMvYWRhbS9Eb2N1bWVudHMvd29ya3NwYWNlL3BlcnNvbmFsL3NlY3Rvci9ub2RlX21vZHVsZXMvbG9kYXNoLW5vZGUvbW9kZXJuL29iamVjdHMvY3JlYXRlLmpzIiwiL1VzZXJzL2FkYW0vRG9jdW1lbnRzL3dvcmtzcGFjZS9wZXJzb25hbC9zZWN0b3Ivbm9kZV9tb2R1bGVzL2xvZGFzaC1ub2RlL21vZGVybi9vYmplY3RzL2RlZmF1bHRzLmpzIiwiL1VzZXJzL2FkYW0vRG9jdW1lbnRzL3dvcmtzcGFjZS9wZXJzb25hbC9zZWN0b3Ivbm9kZV9tb2R1bGVzL2xvZGFzaC1ub2RlL21vZGVybi9vYmplY3RzL2ZvckluLmpzIiwiL1VzZXJzL2FkYW0vRG9jdW1lbnRzL3dvcmtzcGFjZS9wZXJzb25hbC9zZWN0b3Ivbm9kZV9tb2R1bGVzL2xvZGFzaC1ub2RlL21vZGVybi9vYmplY3RzL2Zvck93bi5qcyIsIi9Vc2Vycy9hZGFtL0RvY3VtZW50cy93b3Jrc3BhY2UvcGVyc29uYWwvc2VjdG9yL25vZGVfbW9kdWxlcy9sb2Rhc2gtbm9kZS9tb2Rlcm4vb2JqZWN0cy9mdW5jdGlvbnMuanMiLCIvVXNlcnMvYWRhbS9Eb2N1bWVudHMvd29ya3NwYWNlL3BlcnNvbmFsL3NlY3Rvci9ub2RlX21vZHVsZXMvbG9kYXNoLW5vZGUvbW9kZXJuL29iamVjdHMvaGFzLmpzIiwiL1VzZXJzL2FkYW0vRG9jdW1lbnRzL3dvcmtzcGFjZS9wZXJzb25hbC9zZWN0b3Ivbm9kZV9tb2R1bGVzL2xvZGFzaC1ub2RlL21vZGVybi9vYmplY3RzL2lzQXJndW1lbnRzLmpzIiwiL1VzZXJzL2FkYW0vRG9jdW1lbnRzL3dvcmtzcGFjZS9wZXJzb25hbC9zZWN0b3Ivbm9kZV9tb2R1bGVzL2xvZGFzaC1ub2RlL21vZGVybi9vYmplY3RzL2lzQXJyYXkuanMiLCIvVXNlcnMvYWRhbS9Eb2N1bWVudHMvd29ya3NwYWNlL3BlcnNvbmFsL3NlY3Rvci9ub2RlX21vZHVsZXMvbG9kYXNoLW5vZGUvbW9kZXJuL29iamVjdHMvaXNGdW5jdGlvbi5qcyIsIi9Vc2Vycy9hZGFtL0RvY3VtZW50cy93b3Jrc3BhY2UvcGVyc29uYWwvc2VjdG9yL25vZGVfbW9kdWxlcy9sb2Rhc2gtbm9kZS9tb2Rlcm4vb2JqZWN0cy9pc09iamVjdC5qcyIsIi9Vc2Vycy9hZGFtL0RvY3VtZW50cy93b3Jrc3BhY2UvcGVyc29uYWwvc2VjdG9yL25vZGVfbW9kdWxlcy9sb2Rhc2gtbm9kZS9tb2Rlcm4vb2JqZWN0cy9pc1N0cmluZy5qcyIsIi9Vc2Vycy9hZGFtL0RvY3VtZW50cy93b3Jrc3BhY2UvcGVyc29uYWwvc2VjdG9yL25vZGVfbW9kdWxlcy9sb2Rhc2gtbm9kZS9tb2Rlcm4vb2JqZWN0cy9rZXlzLmpzIiwiL1VzZXJzL2FkYW0vRG9jdW1lbnRzL3dvcmtzcGFjZS9wZXJzb25hbC9zZWN0b3Ivbm9kZV9tb2R1bGVzL2xvZGFzaC1ub2RlL21vZGVybi9vYmplY3RzL29taXQuanMiLCIvVXNlcnMvYWRhbS9Eb2N1bWVudHMvd29ya3NwYWNlL3BlcnNvbmFsL3NlY3Rvci9ub2RlX21vZHVsZXMvbG9kYXNoLW5vZGUvbW9kZXJuL29iamVjdHMvcGljay5qcyIsIi9Vc2Vycy9hZGFtL0RvY3VtZW50cy93b3Jrc3BhY2UvcGVyc29uYWwvc2VjdG9yL25vZGVfbW9kdWxlcy9sb2Rhc2gtbm9kZS9tb2Rlcm4vb2JqZWN0cy92YWx1ZXMuanMiLCIvVXNlcnMvYWRhbS9Eb2N1bWVudHMvd29ya3NwYWNlL3BlcnNvbmFsL3NlY3Rvci9ub2RlX21vZHVsZXMvbG9kYXNoLW5vZGUvbW9kZXJuL3N1cHBvcnQuanMiLCIvVXNlcnMvYWRhbS9Eb2N1bWVudHMvd29ya3NwYWNlL3BlcnNvbmFsL3NlY3Rvci9ub2RlX21vZHVsZXMvbG9kYXNoLW5vZGUvbW9kZXJuL3V0aWxpdGllcy9lc2NhcGUuanMiLCIvVXNlcnMvYWRhbS9Eb2N1bWVudHMvd29ya3NwYWNlL3BlcnNvbmFsL3NlY3Rvci9ub2RlX21vZHVsZXMvbG9kYXNoLW5vZGUvbW9kZXJuL3V0aWxpdGllcy9pZGVudGl0eS5qcyIsIi9Vc2Vycy9hZGFtL0RvY3VtZW50cy93b3Jrc3BhY2UvcGVyc29uYWwvc2VjdG9yL25vZGVfbW9kdWxlcy9sb2Rhc2gtbm9kZS9tb2Rlcm4vdXRpbGl0aWVzL25vb3AuanMiLCIvVXNlcnMvYWRhbS9Eb2N1bWVudHMvd29ya3NwYWNlL3BlcnNvbmFsL3NlY3Rvci9ub2RlX21vZHVsZXMvbG9kYXNoLW5vZGUvbW9kZXJuL3V0aWxpdGllcy9wcm9wZXJ0eS5qcyIsIi9Vc2Vycy9hZGFtL0RvY3VtZW50cy93b3Jrc3BhY2UvcGVyc29uYWwvc2VjdG9yL25vZGVfbW9kdWxlcy9sb2Rhc2gtbm9kZS9tb2Rlcm4vdXRpbGl0aWVzL3Jlc3VsdC5qcyIsIi9Vc2Vycy9hZGFtL0RvY3VtZW50cy93b3Jrc3BhY2UvcGVyc29uYWwvc2VjdG9yL25vZGVfbW9kdWxlcy9sb2Rhc2gtbm9kZS9tb2Rlcm4vdXRpbGl0aWVzL3RlbXBsYXRlLmpzIiwiL1VzZXJzL2FkYW0vRG9jdW1lbnRzL3dvcmtzcGFjZS9wZXJzb25hbC9zZWN0b3Ivbm9kZV9tb2R1bGVzL2xvZGFzaC1ub2RlL21vZGVybi91dGlsaXRpZXMvdGVtcGxhdGVTZXR0aW5ncy5qcyIsIi9Vc2Vycy9hZGFtL0RvY3VtZW50cy93b3Jrc3BhY2UvcGVyc29uYWwvc2VjdG9yL25vZGVfbW9kdWxlcy9sb2Rhc2gtbm9kZS9tb2Rlcm4vdXRpbGl0aWVzL3VuaXF1ZUlkLmpzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBO0FDQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDakZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM3SEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMvRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN0QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDM0hBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDekJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbkJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ25HQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDM0RBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3JCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNsQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMzRkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdkZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdkRBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdEVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDeENBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDakRBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2pGQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNwQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNiQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDOURBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM1Q0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2hGQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM5RUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNwREE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNwREE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2hDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDak5BO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3ZDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdENBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzdDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzFHQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3RCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNqQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDckJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNuQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzFCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2xDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2JBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDYkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNiQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2JBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNwQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNiQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNmQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3pCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDN0JBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDM0NBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN0Q0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3RDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3RFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNoREE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdERBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3REQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbERBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDckNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNuQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN4Q0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDN0NBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzNCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN2Q0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNyQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDcENBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbkVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNqRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDcENBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQy9CQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzVCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDMUJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDeENBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzdDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN4TkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN6RUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSIsInNvdXJjZXNDb250ZW50IjpbIihmdW5jdGlvbiBlKHQsbixyKXtmdW5jdGlvbiBzKG8sdSl7aWYoIW5bb10pe2lmKCF0W29dKXt2YXIgYT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2lmKCF1JiZhKXJldHVybiBhKG8sITApO2lmKGkpcmV0dXJuIGkobywhMCk7dGhyb3cgbmV3IEVycm9yKFwiQ2Fubm90IGZpbmQgbW9kdWxlICdcIitvK1wiJ1wiKX12YXIgZj1uW29dPXtleHBvcnRzOnt9fTt0W29dWzBdLmNhbGwoZi5leHBvcnRzLGZ1bmN0aW9uKGUpe3ZhciBuPXRbb11bMV1bZV07cmV0dXJuIHMobj9uOmUpfSxmLGYuZXhwb3J0cyxlLHQsbixyKX1yZXR1cm4gbltvXS5leHBvcnRzfXZhciBpPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7Zm9yKHZhciBvPTA7bzxyLmxlbmd0aDtvKyspcyhyW29dKTtyZXR1cm4gc30pIiwidmFyIHV0aWxzID0gcmVxdWlyZSgnLi91dGlscycpLFxuICAgIHJlZ2lzdHJ5ID0gcmVxdWlyZSgnLi9yZWdpc3RyeScpLFxuICAgIEhvb2tlZCA9IHJlcXVpcmUoJy4vbWl4aW5zL2hvb2tlZCcpLFxuICAgIFRyYWNlYWJsZSA9IHJlcXVpcmUoJy4vbWl4aW5zL3RyYWNlYWJsZScpLFxuICAgIExpc3RlbmVyID0gcmVxdWlyZSgnLi9taXhpbnMvbGlzdGVuZXInKSxcbiAgICBQdWJTdWIgPSByZXF1aXJlKCcuL21peGlucy9wdWJzdWInKTtcblxudmFyIENvbXBvbmVudCA9IGZ1bmN0aW9uIChvcHRpb25zKSB7XG4gIHZhciBzZWxmID0gdGhpcztcbiAgdmFyIGluaXRPcHRpb25zID0gdXRpbHMub21pdChvcHRpb25zLCAnZWwnKTtcbiAgdmFyIHNwZWNpYWxPcHRpb25zID0gdXRpbHMucGljayhvcHRpb25zLCAnZWwnKTtcbiAgdmFyIGRlZmF1bHRzID0gdXRpbHMucmVzdWx0KHRoaXMsICdkZWZhdWx0cycpO1xuICB2YXIgcHJvcHMgPSB1dGlscy5waWNrKGluaXRPcHRpb25zLCBmdW5jdGlvbiAodmFsdWUsIGtleSkge1xuICAgIHJldHVybiB1dGlscy5oYXMoZGVmYXVsdHMsIGtleSkgfHwga2V5ID09PSAnaWQnO1xuICB9KTtcbiAgdXRpbHMuZGVmYXVsdHModGhpcywgcHJvcHMsIGRlZmF1bHRzKTtcbiAgaWYgKCF0aGlzLmlkKSB7XG4gICAgdGhpcy5pZCA9IHV0aWxzLnVuaXF1ZUlkKCdpJyk7XG4gIH1cbiAgaWYgKHV0aWxzLmhhcyhzcGVjaWFsT3B0aW9ucywgJ2VsJykpIHtcbiAgICB0aGlzLmVsID0gdXRpbHMuaXNTdHJpbmcoc3BlY2lhbE9wdGlvbnMuZWwpID9cbiAgICAgIHV0aWxzLnNlbGVjdChzcGVjaWFsT3B0aW9ucy5lbCwgdHJ1ZSkgOiBzcGVjaWFsT3B0aW9ucy5lbDtcbiAgICB0aGlzLmVsLmFkZEV2ZW50TGlzdGVuZXIoJ0RPTU5vZGVSZW1vdmVkJywgZnVuY3Rpb24gKGV2ZW50KSB7XG4gICAgICBpZiAoZXZlbnQudGFyZ2V0ID09PSBzZWxmLmVsKSB7XG4gICAgICAgIHNlbGYuZWwucmVtb3ZlRXZlbnRMaXN0ZW5lcignRE9NTm9kZVJlbW92ZWQnLCB0aGlzKTtcbiAgICAgICAgc2VsZi5kZXN0cm95KCk7XG4gICAgICB9XG4gICAgfSwgZmFsc2UpO1xuICAgIHRoaXMuYWZ0ZXIoJ2Rlc3Ryb3knLCBmdW5jdGlvbiAoKSB7XG4gICAgICB0aGlzLmVsID0gdW5kZWZpbmVkO1xuICAgIH0pO1xuICB9XG4gIHJlZ2lzdHJ5LmFkZEluc3RhbmNlKHRoaXMpO1xuICB0aGlzLmluaXRpYWxpemUuY2FsbCh0aGlzLCBpbml0T3B0aW9ucyk7XG59O1xuXG5Db21wb25lbnQucHJvdG90eXBlLnNlbGVjdCA9IGZ1bmN0aW9uIChzZWxlY3Rvciwgb25lKSB7XG4gIHJldHVybiB1dGlscy5zZWxlY3QodGhpcy5lbCwgc2VsZWN0b3IsIG9uZSk7XG59O1xuXG5Db21wb25lbnQucHJvdG90eXBlLnRvU3RyaW5nID0gZnVuY3Rpb24gKCkge1xuICByZXR1cm4gJ1snICsgdGhpcy50eXBlICsgJyAnICsgdGhpcy5pZCArICddJztcbn07XG5cbkNvbXBvbmVudC5wcm90b3R5cGUuZGVmYXVsdHMgPSB7fTtcblxuQ29tcG9uZW50LnByb3RvdHlwZS5pbml0aWFsaXplID0gdXRpbHMubm9vcDtcblxuQ29tcG9uZW50LnByb3RvdHlwZS5kZXN0cm95ID0gdXRpbHMubm9vcDtcblxuQ29tcG9uZW50LmRlZmluZSA9IGZ1bmN0aW9uIChwcm9wZXJ0aWVzIC8qLCBtaXhpbnMuLi4gKi8pIHtcbiAgdmFyIGFyZ3MsIGNvbXA7XG4gIGlmICghcHJvcGVydGllcy50eXBlKSB7XG4gICAgcHJvcGVydGllcy50eXBlID0gdXRpbHMudW5pcXVlSWQoJ2MnKTtcbiAgfVxuICBhcmdzID0gQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwoYXJndW1lbnRzLCAxKTtcbiAgYXJncy51bnNoaWZ0KHByb3BlcnRpZXMsIEhvb2tlZCwgVHJhY2VhYmxlLCBMaXN0ZW5lciwgUHViU3ViKTtcbiAgY29tcCA9IHV0aWxzLmRlZmluZS5hcHBseSh0aGlzLCBhcmdzKTtcbiAgcmVnaXN0cnkuYWRkQ29tcG9uZW50KGNvbXApO1xuICByZXR1cm4gY29tcDtcbn07XG5cbkNvbXBvbmVudC5hdHRhY2hUbyA9IGZ1bmN0aW9uIChzZWxlY3Rvciwgb3B0aW9ucykge1xuICB2YXIgc2VsZiA9IHRoaXMsIGluc3RhbmNlLCBlbGVtZW50cztcbiAgb3B0aW9ucyA9IG9wdGlvbnMgfHwge307XG4gIGVsZW1lbnRzID0gdXRpbHMuaXNTdHJpbmcoc2VsZWN0b3IpID8gdXRpbHMuc2VsZWN0KHNlbGVjdG9yKSA6IFtzZWxlY3Rvcl07XG4gIGZvciAodmFyIGkgPSAwLCBsID0gZWxlbWVudHMubGVuZ3RoOyBpIDwgbDsgaSsrKSB7XG4gICAgb3B0aW9ucy5lbCA9IGVsZW1lbnRzW2ldO1xuICAgIG9wdGlvbnMuaWQgPSBvcHRpb25zLmlkIHx8IGVsZW1lbnRzW2ldLmlkO1xuICAgIGluc3RhbmNlID0gbmV3IHNlbGYob3B0aW9ucyk7XG4gIH07XG59O1xuXG5Db21wb25lbnQuZGVzdHJveUFsbCA9IGZ1bmN0aW9uICgpIHtcbiAgdmFyIGluc3RhbmNlcyA9IHJlZ2lzdHJ5LmZpbmRJbnN0YW5jZXNPZih0aGlzLnByb3RvdHlwZS50eXBlKTtcbiAgZm9yICh2YXIgaSA9IDAsIGwgPSBpbnN0YW5jZXMubGVuZ3RoOyBpIDwgbDsgaSsrKSB7XG4gICAgaW5zdGFuY2VzW2ldLmRlc3Ryb3koKTtcbiAgICByZWdpc3RyeS5yZW1vdmVJbnN0YW5jZShpbnN0YW5jZXNbaV0pO1xuICB9XG59O1xuXG5tb2R1bGUuZXhwb3J0cyA9IENvbXBvbmVudDsiLCIvKlxuICogaW5zcGlyYXRpb24gYW5kIHNvbWUgY29kZSBib3Jyb3dlZCBmcm9tXG4gKiBodHRwOi8va3Jhc2ltaXJ0c29uZXYuY29tL2Jsb2cvYXJ0aWNsZS9BLW1vZGVybi1KYXZhU2NyaXB0LXJvdXRlci1pbi0xMDAtbGluZXMtaGlzdG9yeS1hcGktcHVzaFN0YXRlLWhhc2gtdXJsXG4gKiBhbmQgZnJvbSBCYWNrYm9uZS5Sb3V0ZXIgaHR0cHM6Ly9naXRodWIuY29tL2phc2hrZW5hcy9iYWNrYm9uZVxuICovXG5cbnZhciBDb21wb25lbnQgPSByZXF1aXJlKCcuLi9jb21wb25lbnQnKSxcbiAgICB1dGlscyA9IHJlcXVpcmUoJy4uL3V0aWxzJyk7XG5cbnZhciBvcHRpb25hbFBhcmFtID0gL1xcKCguKj8pXFwpL2c7XG52YXIgbmFtZWRQYXJhbSAgICA9IC8oXFwoXFw/KT86XFx3Ky9nO1xudmFyIHNwbGF0UGFyYW0gICAgPSAvXFwqXFx3Ky9nO1xudmFyIGVzY2FwZVJlZ0V4cCAgPSAvW1xcLXt9XFxbXFxdKz8uLFxcXFxcXF4kfCNcXHNdL2c7XG5cbnZhciBSb3V0ZXIgPSBDb21wb25lbnQuZGVmaW5lKHtcbiAgdHlwZTogJ3JvdXRlcicsXG4gIGRlZmF1bHRzOiB7XG4gICAgbW9kZTogJ2hpc3RvcnknLFxuICAgIHJvb3Q6ICcvJyxcbiAgICByb3V0ZVRvcGljOiAndWkucm91dGVDaGFuZ2VkJyxcbiAgICBiYWNrUmVxdWVzdFRvcGljOiAndWkubmF2aWdhdGVCYWNrUmVxdWVzdGVkJyxcbiAgICBmb3J3YXJkUmVxdWVzdFRvcGljOiAndWkubmF2aWdhdGVGb3J3YXJkUmVxdWVzdGVkJyxcbiAgICBuYXZpZ2F0ZVJlcXVlc3RUb3BpYzogJ3VpLm5hdmlnYXRlUmVxdWVzdGVkJyxcbiAgICB1aVJlYWR5VG9waWM6ICd1aS5yZWFkeSdcbiAgfSxcbiAgaW5pdGlhbGl6ZTogZnVuY3Rpb24gKG9wdGlvbnMpIHtcbiAgICBpZiAoIWhpc3RvcnkucHVzaFN0YXRlKSB7IHRoaXMubW9kZSA9ICdoYXNoJzsgfVxuICAgIGlmICh0aGlzLnJvb3QgIT09ICcvJykge1xuICAgICAgdGhpcy5yb290ID0gJy8nICsgdGhpcy5fY2xlYXJTbGFzaGVzKG9wdGlvbnMucm9vdCkgKyAnLyc7XG4gICAgfVxuICAgIHRoaXMucm91dGVzID0ge307XG4gICAgaWYgKG9wdGlvbnMucm91dGVzKSB7XG4gICAgICBmb3IgKHZhciBuYW1lIGluIG9wdGlvbnMucm91dGVzKSB7XG4gICAgICAgIHRoaXMuYWRkUm91dGUobmFtZSwgb3B0aW9ucy5yb3V0ZXNbbmFtZV0pO1xuICAgICAgfVxuICAgIH1cbiAgICB0aGlzLnN1YnNjcmliZSh0aGlzLm5hdmlnYXRlUmVxdWVzdFRvcGljLCB0aGlzLl9oYW5kbGVOYXZpZ2F0ZVJlcXVlc3QpO1xuICAgIHRoaXMuc3Vic2NyaWJlKHRoaXMuYmFja1JlcXVlc3RUb3BpYywgdGhpcy5faGFuZGxlQmFja1JlcXVlc3QpO1xuICAgIHRoaXMuc3Vic2NyaWJlKHRoaXMuZm9yd2FyZFJlcXVlc3RUb3BpYywgdGhpcy5faGFuZGxlRm9yd2FyZFJlcXVlc3QpO1xuICAgIHRoaXMubGlzdGVuVG8od2luZG93LCAnaGFzaGNoYW5nZScsIHRoaXMuX2hhbmRsZUhhc2hDaGFuZ2UpO1xuICAgIHRoaXMuc3Vic2NyaWJlKHRoaXMudWlSZWFkeVRvcGljLCBmdW5jdGlvbiAoKSB7XG4gICAgICB2YXIgbXNnID0gdGhpcy5fcGFyc2VGcmFnbWVudCh0aGlzLmdldEZyYWdtZW50KCkpO1xuICAgICAgdGhpcy5wdWJsaXNoKHRoaXMucm91dGVUb3BpYywgbXNnKTtcbiAgICB9KTtcbiAgfSxcbiAgYWRkUm91dGU6IGZ1bmN0aW9uIChuYW1lLCByb3V0ZSkge1xuICAgIHJvdXRlID0gcm91dGUucmVwbGFjZShlc2NhcGVSZWdFeHAsICdcXFxcJCYnKVxuICAgICAgLnJlcGxhY2Uob3B0aW9uYWxQYXJhbSwgJyg/OiQxKT8nKVxuICAgICAgLnJlcGxhY2UobmFtZWRQYXJhbSwgZnVuY3Rpb24obWF0Y2gsIG9wdGlvbmFsKSB7XG4gICAgICAgIHJldHVybiBvcHRpb25hbCA/IG1hdGNoIDogJyhbXi8/XSspJztcbiAgICAgIH0pXG4gICAgICAucmVwbGFjZShzcGxhdFBhcmFtLCAnKFteP10qPyknKTtcbiAgICB2YXIgcmVnZXggPSBuZXcgUmVnRXhwKCdeJyArIHJvdXRlICsgJyg/OlxcXFw/KFtcXFxcc1xcXFxTXSopKT8kJyk7XG4gICAgdGhpcy50cmFjZSgnYWRkaW5nIG5hbWVkIHJvdXRlOiAnICsgbmFtZSwgcmVnZXgpO1xuICAgIHRoaXMucm91dGVzW25hbWVdID0gcmVnZXg7XG4gIH0sXG4gIGdldEZyYWdtZW50OiBmdW5jdGlvbiAoKSB7XG4gICAgdmFyIGZyYWdtZW50ID0gJycsIG1hdGNoO1xuICAgIGlmICh0aGlzLm1vZGUgPT09ICdoaXN0b3J5Jykge1xuICAgICAgZnJhZ21lbnQgPSB0aGlzLl9jbGVhclNsYXNoZXMoZGVjb2RlVVJJKGxvY2F0aW9uLnBhdGhuYW1lICsgbG9jYXRpb24uc2VhcmNoKSk7XG4gICAgICBmcmFnbWVudCA9IGZyYWdtZW50LnJlcGxhY2UoL1xcPyguKikkLywgJycpO1xuICAgICAgZnJhZ21lbnQgPSB0aGlzLnJvb3QgIT09ICcvJyA/IGZyYWdtZW50LnJlcGxhY2UodGhpcy5yb290LCAnJykgOiBmcmFnbWVudDtcbiAgICB9IGVsc2Uge1xuICAgICAgbWF0Y2ggPSB3aW5kb3cubG9jYXRpb24uaHJlZi5tYXRjaCgvIyguKikkLyk7XG4gICAgICBmcmFnbWVudCA9IG1hdGNoID8gbWF0Y2hbMV0gOiAnJztcbiAgICB9XG4gICAgcmV0dXJuIGZyYWdtZW50O1xuICB9LFxuICBfcGFyc2VGcmFnbWVudDogZnVuY3Rpb24gKGZyYWdtZW50KSB7XG4gICAgdGhpcy50cmFjZSgncGFyc2luZyBmcmFnbWVudCAnICsgZnJhZ21lbnQpO1xuICAgIGZvciAodmFyIG5hbWUgaW4gdGhpcy5yb3V0ZXMpIHtcbiAgICAgIHZhciByb3V0ZSA9IHRoaXMucm91dGVzW25hbWVdO1xuICAgICAgdGhpcy50cmFjZSgnZXZhbCByb3V0ZSAnICsgbmFtZSwgcm91dGUpO1xuICAgICAgdmFyIHBhcmFtcyA9IHJvdXRlLmV4ZWMoZnJhZ21lbnQpO1xuICAgICAgaWYgKHBhcmFtcykge1xuICAgICAgICBwYXJhbXMgPSBwYXJhbXMuc2xpY2UoMSk7XG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgbmFtZTogbmFtZSxcbiAgICAgICAgICBwYXRoOiBmcmFnbWVudCxcbiAgICAgICAgICBwYXJhbXM6IHV0aWxzLm1hcChwYXJhbXMsIGZ1bmN0aW9uKHBhcmFtLCBpKSB7XG4gICAgICAgICAgICAvLyBEb24ndCBkZWNvZGUgdGhlIHNlYXJjaCBwYXJhbXMuXG4gICAgICAgICAgICBpZiAoaSA9PT0gcGFyYW1zLmxlbmd0aCAtIDEpIHsgcmV0dXJuIHBhcmFtIHx8IG51bGw7IH1cbiAgICAgICAgICAgIHJldHVybiBwYXJhbSA/IGRlY29kZVVSSUNvbXBvbmVudChwYXJhbSkgOiBudWxsO1xuICAgICAgICAgIH0pXG4gICAgICAgIH07XG4gICAgICB9XG4gICAgfVxuICAgIHJldHVybiB7fTtcbiAgfSxcbiAgX2NsZWFyU2xhc2hlczogZnVuY3Rpb24ocGF0aCkge1xuICAgIHJldHVybiBwYXRoLnRvU3RyaW5nKCkucmVwbGFjZSgvXFwvJC8sICcnKS5yZXBsYWNlKC9eXFwvLywgJycpO1xuICB9LFxuICBfaGFuZGxlSGFzaENoYW5nZTogZnVuY3Rpb24gKCkge1xuICAgIHZhciBmcmFnbWVudCwgbXNnO1xuICAgIGZyYWdtZW50ID0gdGhpcy5nZXRGcmFnbWVudCgpO1xuICAgIG1zZyA9IHRoaXMuX3BhcnNlRnJhZ21lbnQoZnJhZ21lbnQpO1xuICAgIHRoaXMucHVibGlzaCh0aGlzLnJvdXRlVG9waWMsIG1zZyk7XG4gIH0sXG4gIF9oYW5kbGVOYXZpZ2F0ZVJlcXVlc3Q6IGZ1bmN0aW9uIChtc2cpIHtcbiAgICB2YXIgcGF0aCA9IG1zZy5kYXRhID8gbXNnLmRhdGEgOiAnJztcbiAgICBpZih0aGlzLm1vZGUgPT09ICdoaXN0b3J5Jykge1xuICAgICAgaGlzdG9yeS5wdXNoU3RhdGUobnVsbCwgbnVsbCwgdGhpcy5yb290ICsgdGhpcy5fY2xlYXJTbGFzaGVzKHBhdGgpKTtcbiAgICB9IGVsc2Uge1xuICAgICAgd2luZG93LmxvY2F0aW9uLmhyZWYubWF0Y2goLyMoLiopJC8pO1xuICAgICAgd2luZG93LmxvY2F0aW9uLmhyZWYgPSB3aW5kb3cubG9jYXRpb24uaHJlZi5yZXBsYWNlKC8jKC4qKSQvLCAnJykgKyAnIycgKyBwYXRoO1xuICAgIH1cbiAgICB2YXIgb3V0TXNnID0gdGhpcy5fcGFyc2VGcmFnbWVudChwYXRoKTtcbiAgICB0aGlzLnB1Ymxpc2godGhpcy5yb3V0ZVRvcGljLCBvdXRNc2cpO1xuICB9LFxuICBfaGFuZGxlQmFja1JlcXVlc3Q6IGZ1bmN0aW9uICgpIHtcbiAgICB2YXIgZnJhZ21lbnQsIG1zZztcbiAgICB3aW5kb3cuaGlzdG9yeS5iYWNrKCk7XG4gICAgZnJhZ21lbnQgPSB0aGlzLmdldEZyYWdtZW50KCk7XG4gICAgbXNnID0gdGhpcy5fcGFyc2VGcmFnbWVudChmcmFnbWVudCk7XG4gICAgdGhpcy5wdWJsaXNoKHRoaXMucm91dGVUb3BpYywgbXNnKTtcbiAgfSxcbiAgX2hhbmRsZUZvcndhcmRSZXF1ZXN0OiBmdW5jdGlvbiAoKSB7XG4gICAgdmFyIGZyYWdtZW50LCBtc2c7XG4gICAgd2luZG93Lmhpc3RvcnkuZm9yd2FyZCgpO1xuICAgIGZyYWdtZW50ID0gdGhpcy5nZXRGcmFnbWVudCgpO1xuICAgIG1zZyA9IHRoaXMuX3BhcnNlRnJhZ21lbnQoZnJhZ21lbnQpO1xuICAgIHRoaXMucHVibGlzaCh0aGlzLnJvdXRlVG9waWMsIG1zZyk7XG4gIH1cbn0pO1xuXG5tb2R1bGUuZXhwb3J0cyA9IFJvdXRlcjsiLCIvLyBTZWN0b3IuanNcbi8vID09PT09PT09PVxuXG4vLyBFeHBvcnRzIHRoZSBjb3JlIG1peGlucy5cbmV4cG9ydHMubWl4aW5zID0ge1xuICBIb29rZWQ6IHJlcXVpcmUoJy4vbWl4aW5zL2hvb2tlZCcpLFxuICBUcmFjZWFibGU6IHJlcXVpcmUoJy4vbWl4aW5zL3RyYWNlYWJsZScpLFxuICBMaXN0ZW5lcjogcmVxdWlyZSgnLi9taXhpbnMvbGlzdGVuZXInKSxcbiAgUHViU3ViOiByZXF1aXJlKCcuL21peGlucy9wdWJzdWInKSxcbiAgVmlldzogcmVxdWlyZSgnLi9taXhpbnMvdmlldycpXG59O1xuXG4vLyBFeHBvcnRzIHRoZSBpbmNsdWRlZCBjb21wb25lbnRzLlxuZXhwb3J0cy5jb21wb25lbnRzID0ge1xuICBSb3V0ZXI6IHJlcXVpcmUoJy4vY29tcG9uZW50cy9yb3V0ZXInKVxufTtcblxuLy8gRXhwb3J0cyBmb3IgY29tbW9uIHV0aWxpdGllcy5cbmV4cG9ydHMudXRpbHMgPSByZXF1aXJlKCcuL3V0aWxzJyk7XG5cbi8vIEV4cG9ydCBDb21wb25lbnQgY2xhc3MsIHRoZSBiYXNpcyBmb3IgZXZlcnl0aGluZy5cbmV4cG9ydHMuQ29tcG9uZW50ID0gcmVxdWlyZSgnLi9jb21wb25lbnQnKTtcblxuLy8gRXhwb3J0cyBjb21wb25lbnQgcmVnaXN0cnkgaW5zdGFuY2UuXG5leHBvcnRzLnJlZ2lzdHJ5ID0gcmVxdWlyZSgnLi9yZWdpc3RyeScpO1xuXG4vLyBUaGUgKippbml0KiogZnVuY3Rpb24gbG9va3MgZm9yIGFueSBlbGVtZW50cyBpbiB0aGUgRE9NIHdpdGggYSAqZGF0YS1jb21wb25lbnQqXG4vLyBhdHRyaWJ1dGUuIEl0IHRoZW4gdXNlcyB0aGUgYXR0cmlidXRlcyB2YWx1ZSB0byBsb29rdXAgYSBjb21wb25lbnQgcmVnaXN0ZXJlZFxuLy8gd2l0aCB0aGUgc2FtZSB0eXBlIGFuZCB0aGUgKmRhdGEtb3B0aW9ucyogYXR0ciwgYSBKU09OIHNlcmlhbGl6ZWQgdmFsdWUgb3Igb3B0aW9ucyxcbi8vIG9yIHRoZSAqZGF0YS1vcHRpb25zLSoqIGF0dHJzIHRvIGNyZWF0ZSBhIG5ldyBpbnN0YW5jZSBvZiB0aGUgY29tcG9uZW50IGF0dGFjaGVkIHRvXG4vLyB0aGUgZWxlbWVudC4gRm9yIGV4YW1wbGU6XG4vL1xuLy8gICAgIDxkaXYgaWQ9XCJoZWxsb1wiIGRhdGEtY29tcG9uZW50PVwiaGVsbG8td29ybGRcIiBkYXRhLW9wdGlvbnMtZGVidWc9XCJ0cnVlXCI+XG4vLyAgICAgPC9kaXY+XG4vL1xuLy8gV2lsbCBjcmVhdGUgYSBuZXcgaW5zdGFuY2Ugb2YgdGhlICpoZWxsby13b3JsZCogY29tcG9uZW50IHdpdGggYW4gSUQgb2YgXCJoZWxsb1wiXG4vLyBhbmQgdGhlIGRlYnVnIG9wdGlvbiBzZXQgdG8gKnRydWUqXG4vL1xuLy8gVGhpcyBmdW5jdGlvbiB3aWxsIHB1Ymxpc2ggYSA8Y29kZT51aS5yZWFkeTwvY29kZT4gbWVzc2FnZSB3aGVuIGFsbFxuLy8gY29tcG9uZW50cyBoYXZlIGJlZW4gaW5pdGlhbGl6ZWQuXG5leHBvcnRzLmluaXQgPSBmdW5jdGlvbiAocm9vdCwgb3B0aW9ucykge1xuICBpZiAoIW9wdGlvbnMpIHtcbiAgICBvcHRpb25zID0gcm9vdDtcbiAgICByb290ID0gZG9jdW1lbnQ7XG4gIH1cbiAgcm9vdCA9IHJvb3QgfHwgZG9jdW1lbnQ7XG4gIG9wdGlvbnMgPSBvcHRpb25zIHx8IHt9O1xuICBleHBvcnRzLnV0aWxzLmRlZmF1bHRzKG9wdGlvbnMsIHtcbiAgICBjb21wb25lbnRTZWxlY3RvcjogJ1tkYXRhLWNvbXBvbmVudF0nLFxuICAgIGNvbXBvbmVudEF0dHJpYnV0ZTogJ2RhdGEtY29tcG9uZW50JyxcbiAgICBvcHRpb25zQXR0cmlidXRlOiAnZGF0YS1vcHRpb25zJyxcbiAgICBvcHRpb25zQXR0clByZWZpeDogJ2RhdGEtb3B0aW9ucy0nXG4gIH0pO1xuICBleHBvcnRzLnV0aWxzLmRvY3VtZW50UmVhZHkoZnVuY3Rpb24gKCkge1xuICAgIHZhciBub2RlcyA9IFtdLnNsaWNlLmNhbGwocm9vdC5xdWVyeVNlbGVjdG9yQWxsKG9wdGlvbnMuY29tcG9uZW50U2VsZWN0b3IpKTtcbiAgICBub2Rlcy5mb3JFYWNoKGZ1bmN0aW9uIChub2RlKSB7XG4gICAgICB2YXIgZWwsIGNvbXBvbmVudE9wdGlvbnMgPSB7fSwgYXR0cnMsIHR5cGUsIGNvbXBvbmVudCwgb3B0QXR0clByZWZpeExlbmd0aDtcbiAgICAgIHR5cGUgPSBub2RlLmdldEF0dHJpYnV0ZShvcHRpb25zLmNvbXBvbmVudEF0dHJpYnV0ZSk7XG4gICAgICBjb21wb25lbnRPcHRpb25zLmlkID0gbm9kZS5pZDtcbiAgICAgIGlmIChub2RlLmhhc0F0dHJpYnV0ZShvcHRpb25zLm9wdGlvbnNBdHRyaWJ1dGUpKSB7XG4gICAgICAgIGNvbXBvbmVudE9wdGlvbnMgPSBKU09OLnBhcnNlKG5vZGUuZ2V0QXR0cmlidXRlKG9wdGlvbnMub3B0aW9uc0F0dHJpYnV0ZSkpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgYXR0cnMgPSBbXS5zbGljZS5jYWxsKG5vZGUuYXR0cmlidXRlcyk7XG4gICAgICAgIG9wdEF0dHJQcmVmaXhMZW5ndGggPSBvcHRpb25zLm9wdGlvbnNBdHRyUHJlZml4Lmxlbmd0aDtcbiAgICAgICAgYXR0cnMuZm9yRWFjaChmdW5jdGlvbiAoYXR0cikge1xuICAgICAgICAgIGlmIChhdHRyLm5hbWUuc3Vic3RyKDAsIG9wdEF0dHJQcmVmaXhMZW5ndGgpID09PSBvcHRpb25zLm9wdGlvbnNBdHRyUHJlZml4KSB7XG4gICAgICAgICAgICBjb21wb25lbnRPcHRpb25zW2F0dHIubmFtZS5zdWJzdHIob3B0QXR0clByZWZpeExlbmd0aCldID0gYXR0ci52YWx1ZTtcbiAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgICAgZWwgPSAobm9kZS50YWdOYW1lLnRvTG93ZXJDYXNlKCkgPT09ICdzY3JpcHQnKSA/IHJvb3QgOiBub2RlO1xuICAgICAgY29tcG9uZW50ID0gZXhwb3J0cy5yZWdpc3RyeS5maW5kQ29tcG9uZW50KHR5cGUpO1xuICAgICAgY29tcG9uZW50LmF0dGFjaFRvKGVsLCBjb21wb25lbnRPcHRpb25zKTtcbiAgICB9KTtcbiAgICB2YXIgZSA9IGV4cG9ydHMudXRpbHMuY3JlYXRlRXZlbnQoJ3B1YnN1Yi51aS5yZWFkeScsXG4gICAgICB7IHRvcGljOiAndWkucmVhZHknLCBkYXRhOiB7fSB9XG4gICAgKTtcbiAgICB3aW5kb3cuZG9jdW1lbnQuZGlzcGF0Y2hFdmVudChlKTtcbiAgfSk7XG59OyIsIlxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiAoKSB7XG4gIHRoaXMuYWZ0ZXIgPSBmdW5jdGlvbiAobWV0aG9kLCBhZnRlckZ1bmMpIHtcbiAgICB2YXIgb0Z1bmMgPSB0aGlzW21ldGhvZF07XG4gICAgdGhpc1ttZXRob2RdID0gZnVuY3Rpb24gY29tcG9zZWRGdW5jICgpIHtcbiAgICAgIG9GdW5jLmFwcGx5KHRoaXMsIGFyZ3VtZW50cyk7XG4gICAgICBhZnRlckZ1bmMuYXBwbHkodGhpcywgYXJndW1lbnRzKTtcbiAgICB9O1xuICB9O1xuXG4gIHRoaXMuYmVmb3JlID0gZnVuY3Rpb24gKG1ldGhvZCwgYmVmb3JlRnVuYykge1xuICAgIHZhciBvRnVuYyA9IHRoaXNbbWV0aG9kXTtcbiAgICB0aGlzW21ldGhvZF0gPSBmdW5jdGlvbiBjb21wb3NlZEZ1bmMgKCkge1xuICAgICAgYmVmb3JlRnVuYy5hcHBseSh0aGlzLCBhcmd1bWVudHMpO1xuICAgICAgb0Z1bmMuYXBwbHkodGhpcywgYXJndW1lbnRzKTtcbiAgICB9O1xuICB9O1xuXG4gIHRoaXMuYXJvdW5kID0gZnVuY3Rpb24gKG1ldGhvZCwgd3JhcEZ1bmMpIHtcbiAgICB2YXIgb0Z1bmMgPSB0aGlzW21ldGhvZF07XG4gICAgdGhpc1ttZXRob2RdID0gdXRpbHMud3JhcChvRnVuYywgd3JhcEZ1bmMpO1xuICB9O1xufTsiLCJ2YXIgdXRpbHMgPSByZXF1aXJlKCcuLi91dGlscycpO1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uICgpIHtcblxuICB0aGlzLmxpc3RlblRvID0gZnVuY3Rpb24gKGVsLCBldmVudCwgZnVuYykge1xuICAgIHZhciBlbHMgPSBlbDtcbiAgICBpZiAoIWZ1bmMpIHtcbiAgICAgIGZ1bmMgPSBldmVudDtcbiAgICAgIGV2ZW50ID0gZWw7XG4gICAgICBlbHMgPSBbdGhpcy5lbF07XG4gICAgfVxuICAgIGlmICh1dGlscy5pc1N0cmluZyhlbCkpIHtcbiAgICAgIGVscyA9IHRoaXMuc2VsZWN0KGVsKTtcbiAgICB9IGVsc2UgaWYgKCF1dGlscy5pc0FycmF5KGVsKSAmJiAhKGVsIGluc3RhbmNlb2YgTm9kZUxpc3QpKSB7XG4gICAgICBlbHMgPSBbZWxdO1xuICAgIH1cbiAgICBmdW5jID0gdXRpbHMuaXNTdHJpbmcoZnVuYykgPyB0aGlzW2Z1bmNdIDogZnVuYztcbiAgICB0aGlzLl9saXN0ZW5lcnMgPSB0aGlzLl9saXN0ZW5lcnMgfHwge307XG4gICAgdmFyIGNyZWF0ZVJlbW92ZWRMaXN0ZW5lciA9IGZ1bmN0aW9uIChlbCkge1xuICAgICAgcmV0dXJuIGZ1bmN0aW9uIChldmVudCkge1xuICAgICAgICB2YXIgZSA9IGV2ZW50LnRhcmdldDtcbiAgICAgICAgaWYgKCFlIHx8IGUgaW5zdGFuY2VvZiBUZXh0KSB7IHJldHVybjsgfVxuICAgICAgICB2YXIgZWlkO1xuICAgICAgICBpZiAoZSA9PT0gd2luZG93KSB7XG4gICAgICAgICAgZWlkID0gJ3dpbmRvdyc7XG4gICAgICAgIH0gZWxzZSBpZiAoZSA9PT0gd2luZG93LmRvY3VtZW50KSB7XG4gICAgICAgICAgZWlkID0gJ2RvY3VtZW50JztcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBlaWQgPSBlLmdldEF0dHJpYnV0ZSgnZGF0YS1zZWN0b3ItZWlkJyk7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHRoaXMuX2xpc3RlbmVyc1tlaWRdKSB7XG4gICAgICAgICAgdGhpcy50cmFjZSgnZWxlbWVudCByZW1vdmVkJywgZSk7XG4gICAgICAgICAgdGhpcy5zdG9wTGlzdGVuaW5nKGUpO1xuICAgICAgICB9XG4gICAgICB9O1xuICAgIH07XG4gICAgdmFyIGNyZWF0ZUxpc3RlbmVyID0gZnVuY3Rpb24gKCkge1xuICAgICAgcmV0dXJuIGZ1bmN0aW9uIChldmVudCkge1xuICAgICAgICB0aGlzLnRyYWNlICYmIHRoaXMudHJhY2UoJzwtICcgKyBldmVudC50YXJnZXQgKyAnLicgKyBldmVudC50eXBlKTtcbiAgICAgICAgZnVuYy5hcHBseSh0aGlzLCBhcmd1bWVudHMpO1xuICAgICAgfTtcbiAgICB9O1xuICAgIGZvciAodmFyIGkgPSAwLCBsID0gZWxzLmxlbmd0aDsgaSA8IGw7IGkrKykge1xuICAgICAgdmFyIGUgPSBlbHNbaV07XG4gICAgICBpZiAoIWUpIHsgY29udGludWU7IH1cbiAgICAgIHZhciBlaWQ7XG4gICAgICBpZiAoZSA9PT0gd2luZG93KSB7XG4gICAgICAgIGVpZCA9ICd3aW5kb3cnO1xuICAgICAgfSBlbHNlIGlmIChlID09PSB3aW5kb3cuZG9jdW1lbnQpIHtcbiAgICAgICAgZWlkID0gJ2RvY3VtZW50JztcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGVpZCA9IGUuZ2V0QXR0cmlidXRlKCdkYXRhLXNlY3Rvci1laWQnKTtcbiAgICAgIH1cbiAgICAgIGlmICghZWlkKSB7XG4gICAgICAgIGVpZCA9IHV0aWxzLnVuaXF1ZUlkKCdlJyk7XG4gICAgICAgIGUuc2V0QXR0cmlidXRlKCdkYXRhLXNlY3Rvci1laWQnLCBlaWQpO1xuICAgICAgfVxuICAgICAgaWYgKCF0aGlzLl9saXN0ZW5lcnNbZWlkXSkge1xuICAgICAgICB0aGlzLl9saXN0ZW5lcnNbZWlkXSA9IHt9O1xuICAgICAgICB0aGlzLl9saXN0ZW5lcnNbZWlkXS5ET01Ob2RlUmVtb3ZlZCA9IHV0aWxzLmJpbmQoY3JlYXRlUmVtb3ZlZExpc3RlbmVyKGUpLCB0aGlzKTtcbiAgICAgICAgZS5hZGRFdmVudExpc3RlbmVyKCdET01Ob2RlUmVtb3ZlZCcsIHRoaXMuX2xpc3RlbmVyc1tlaWRdLkRPTU5vZGVSZW1vdmVkLCBmYWxzZSk7XG4gICAgICB9XG4gICAgICBpZiAodGhpcy5fbGlzdGVuZXJzW2VpZF1bZXZlbnRdKSB7XG4gICAgICAgIGUucmVtb3ZlRXZlbnRMaXN0ZW5lcihldmVudCwgdGhpcy5fbGlzdGVuZXJzW2VpZF1bZXZlbnRdLCBmYWxzZSk7XG4gICAgICB9XG4gICAgICB0aGlzLl9saXN0ZW5lcnNbZWlkXVtldmVudF0gPSB1dGlscy5iaW5kKGNyZWF0ZUxpc3RlbmVyKCksIHRoaXMpO1xuICAgICAgdGhpcy50cmFjZSAmJiB0aGlzLnRyYWNlKCc8Kz4gJyArIGUgKyAnLicgKyBldmVudCk7XG4gICAgICBlLmFkZEV2ZW50TGlzdGVuZXIoZXZlbnQsIHRoaXMuX2xpc3RlbmVyc1tlaWRdW2V2ZW50XSwgZmFsc2UpO1xuICAgIH1cbiAgfTtcblxuICB0aGlzLnN0b3BMaXN0ZW5pbmcgPSBmdW5jdGlvbiAoZWwsIGV2ZW50KSB7XG4gICAgdmFyIGVscyA9IGVsO1xuICAgIGlmIChhcmd1bWVudHMubGVuZ3RoID09PSAxICYmIHV0aWxzLmlzU3RyaW5nKGVsKSkge1xuICAgICAgZXZlbnQgPSBlbDtcbiAgICAgIGVscyA9IFt0aGlzLmVsXTtcbiAgICB9IGVsc2UgaWYgKHV0aWxzLmlzU3RyaW5nKGVsKSkge1xuICAgICAgZWxzID0gdGhpcy5zZWxlY3QoZWwpO1xuICAgIH0gZWxzZSBpZiAoIXV0aWxzLmlzQXJyYXkoZWwpICYmICEoZWwgaW5zdGFuY2VvZiBOb2RlTGlzdCkpIHtcbiAgICAgIGVscyA9IFtlbF07XG4gICAgfVxuICAgIGZvciAodmFyIGkgPSAwLCBsID0gZWxzLmxlbmd0aDsgaSA8IGw7IGkrKykge1xuICAgICAgdmFyIGUgPSBlbHNbaV07XG4gICAgICBpZiAoIWUpIHsgY29udGludWU7IH1cbiAgICAgIHZhciBlaWQ7XG4gICAgICBpZiAoZSA9PT0gd2luZG93KSB7XG4gICAgICAgIGVpZCA9ICd3aW5kb3cnO1xuICAgICAgfSBlbHNlIGlmIChlID09PSB3aW5kb3cuZG9jdW1lbnQpIHtcbiAgICAgICAgZWlkID0gJ2RvY3VtZW50JztcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGVpZCA9IGUuZ2V0QXR0cmlidXRlKCdkYXRhLXNlY3Rvci1laWQnKTtcbiAgICAgIH1cbiAgICAgIGlmICghdGhpcy5fbGlzdGVuZXJzIHx8ICF0aGlzLl9saXN0ZW5lcnNbZWlkXSkgeyBjb250aW51ZTsgfVxuICAgICAgaWYgKGV2ZW50ICYmICF0aGlzLl9saXN0ZW5lcnNbZWlkXVtldmVudF0pIHsgY29udGludWU7IH1cbiAgICAgIGlmICghZXZlbnQpIHtcbiAgICAgICAgZm9yICh2YXIgZXYgaW4gdGhpcy5fbGlzdGVuZXJzW2VpZF0pIHtcbiAgICAgICAgICB0aGlzLnRyYWNlICYmIHRoaXMudHJhY2UoJzx4PiAnICsgZSArICcuJyArIGV2KTtcbiAgICAgICAgICBlLnJlbW92ZUV2ZW50TGlzdGVuZXIoZXYsIHRoaXMuX2xpc3RlbmVyc1tlaWRdW2V2XSk7XG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHRoaXMudHJhY2UgJiYgdGhpcy50cmFjZSgnPHg+ICcgKyBlICsgJy4nICsgZXZlbnQpO1xuICAgICAgICBlLnJlbW92ZUV2ZW50TGlzdGVuZXIoZXZlbnQsIHRoaXMuX2xpc3RlbmVyc1tlaWRdW2V2ZW50XSk7XG4gICAgICAgIGRlbGV0ZSB0aGlzLl9saXN0ZW5lcnNbZWlkXVtldmVudF07XG4gICAgICB9XG4gICAgICBpZiAodGhpcy5fbGlzdGVuZXJzW2VpZF0ubGVuZ3RoID09PSAwKSB7XG4gICAgICAgIGRlbGV0ZSB0aGlzLl9saXN0ZW5lcnNbZWlkXTtcbiAgICAgIH1cbiAgICB9XG4gIH07XG5cbiAgdGhpcy5iZWZvcmUoJ2Rlc3Ryb3knLCBmdW5jdGlvbiAoKSB7XG4gICAgdmFyIGVsO1xuICAgIGZvciAodmFyIGVpZCBpbiB0aGlzLl9saXN0ZW5lcnMpIHtcbiAgICAgIGlmIChlaWQgPT09ICd3aW5kb3cnKSB7XG4gICAgICAgIGVsID0gd2luZG93O1xuICAgICAgfSBlbHNlIGlmIChlaWQgPT09ICdkb2N1bWVudCcpIHtcbiAgICAgICAgZWwgPSB3aW5kb3cuZG9jdW1lbnQ7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBlbCA9IHdpbmRvdy5kb2N1bWVudC5xdWVyeVNlbGVjdG9yKCdbZGF0YS1zZWN0b3ItZWlkPScgKyBlaWQgKyAnXScpO1xuICAgICAgfVxuICAgICAgdGhpcy5zdG9wTGlzdGVuaW5nKGVsKTtcbiAgICB9XG4gIH0pO1xufTsiLCJ2YXIgdXRpbHMgPSByZXF1aXJlKCcuLi91dGlscycpO1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uICgpIHtcblxuICB0aGlzLnB1Ymxpc2ggPSBmdW5jdGlvbiAodG9waWMsIGRhdGEpIHtcbiAgICB0aGlzLnRyYWNlICYmIHRoaXMudHJhY2UoJz0+PiAnICsgdG9waWMgLCBkYXRhKTtcbiAgICB2YXIgZSA9IHV0aWxzLmNyZWF0ZUV2ZW50KCdwdWJzdWIuJyArIHRvcGljLFxuICAgICAgeyB0b3BpczogdG9waWMsIGRhdGE6IGRhdGEgfVxuICAgICk7XG4gICAgd2luZG93LmRvY3VtZW50LmRpc3BhdGNoRXZlbnQoZSk7XG4gIH07XG5cbiAgdGhpcy5zdWJzY3JpYmUgPSBmdW5jdGlvbiAodG9waWMsIGZ1bmMpIHtcbiAgICB0aGlzLnRyYWNlICYmIHRoaXMudHJhY2UoJzw8Kz4+ICcgKyB0b3BpYyk7XG4gICAgZnVuYyA9IHV0aWxzLmlzU3RyaW5nKGZ1bmMpID8gdGhpc1tmdW5jXSA6IGZ1bmM7XG4gICAgdGhpcy5saXN0ZW5Ubyh3aW5kb3cuZG9jdW1lbnQsICdwdWJzdWIuJyArIHRvcGljLCBmdW5jdGlvbiAoZSkge1xuICAgICAgdGhpcy50cmFjZSAmJiB0aGlzLnRyYWNlKCc8PD0gJyArIGUuZGV0YWlsLnRvcGljLCBlLmRldGFpbC5kYXRhKTtcbiAgICAgIGZ1bmMuY2FsbCh0aGlzLCB7dG9waWM6IGUuZGV0YWlsLnRvcGljLCBkYXRhOiBlLmRldGFpbC5kYXRhfSk7XG4gICAgfSk7XG4gIH07XG5cbiAgdGhpcy51bnN1YnNjcmliZSA9IGZ1bmN0aW9uICh0b3BpYykge1xuICAgIHRoaXMudHJhY2UgJiYgdGhpcy50cmFjZSgnPDx4Pj4gJyArIHRvcGljKTtcbiAgICB0aGlzLnN0b3BMaXN0ZW5pbmcod2luZG93LmRvY3VtZW50LCAncHVic3ViLicgKyB0b3BpYyk7XG4gIH07XG59OyIsInZhciB1dGlscyA9IHJlcXVpcmUoJy4uL3V0aWxzJyk7XG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gKCkge1xuICBpZiAoIWNvbnNvbGUpIHsgcmV0dXJuOyB9XG4gIHV0aWxzLmRlZmF1bHRzKHRoaXMuZGVmYXVsdHMsIHtkZWJ1ZzogZmFsc2V9KTtcblxuICB0aGlzLnRyYWNlID0gZnVuY3Rpb24gKG1lc3NhZ2UsIGRhdGEpIHtcbiAgICBpZiAodGhpcy5kZWJ1Zykge1xuICAgICAgY29uc29sZS5sb2codGhpcyArICcgJyArIG1lc3NhZ2UsIGRhdGEpO1xuICAgIH1cbiAgfTtcblxuICB0aGlzLmFmdGVyKCdpbml0aWFsaXplJywgZnVuY3Rpb24gKG9wdGlvbnMpIHtcbiAgICB0aGlzLnRyYWNlKCdpbml0aWFsaXplZCcsIG9wdGlvbnMpO1xuICB9KTtcblxuICB0aGlzLmFmdGVyKCdkZXN0cm95JywgZnVuY3Rpb24gKCkge1xuICAgIHRoaXMudHJhY2UoJ2Rlc3Ryb3llZCcpO1xuICB9KTtcbn07IiwidmFyIHV0aWxzID0gcmVxdWlyZSgnLi4vdXRpbHMnKTtcblxudmFyIFZpZXcgPSBmdW5jdGlvbiAoKSB7XG4gIHZhciBfdGVtcGxhdGVDYWNoZSA9IHt9O1xuXG4gIHRoaXMuYmluZFVJID0gZnVuY3Rpb24gKCkge1xuICAgIGlmICh0aGlzLnVpKSB7XG4gICAgICB0aGlzLl91aSB8fCAoIHRoaXMuX3VpID0gdGhpcy51aSk7XG4gICAgICB2YXIgYmluZGluZyA9IHV0aWxzLnJlc3VsdCh0aGlzLCdfdWknKTtcbiAgICAgIHRoaXMudHJhY2UoJ2JpbmRpbmcgVUknLCBiaW5kaW5nKTtcbiAgICAgIHRoaXMudWkgPSB7fTtcbiAgICAgIHV0aWxzLmZvckluKGJpbmRpbmcsIGZ1bmN0aW9uIChzZWxlY3Rvciwga2V5KSB7XG4gICAgICAgIHRoaXMudWlba2V5XSA9IHRoaXMuc2VsZWN0KHNlbGVjdG9yLCB0cnVlKTtcbiAgICAgIH0sIHRoaXMpO1xuICAgIH1cbiAgfTtcblxuICB0aGlzLnVuYmluZFVJID0gZnVuY3Rpb24gKCkge1xuICAgIGlmICh0aGlzLnVpKSB7XG4gICAgICB0aGlzLl91aSB8fCAoIHRoaXMuX3VpID0gdGhpcy51aSk7XG4gICAgICB2YXIgYmluZGluZyA9IHV0aWxzLnJlc3VsdCh0aGlzLCdfdWknKTtcbiAgICAgIHRoaXMudHJhY2UoJ3VuYmluZGluZyBVSScsIGJpbmRpbmcpO1xuICAgICAgdXRpbHMuZm9ySW4oYmluZGluZywgZnVuY3Rpb24gKHNlbGVjdG9yLCBrZXkpIHtcbiAgICAgICAgZGVsZXRlIHRoaXMudWlba2V5XTtcbiAgICAgIH0sIHRoaXMpO1xuICAgIH1cbiAgfTtcblxuICB0aGlzLmJpbmRFdmVudHMgPSBmdW5jdGlvbiAoKSB7XG4gICAgaWYgKHRoaXMuZXZlbnRzKSB7XG4gICAgICB0aGlzLnRyYWNlKCdiaW5kaW5nIGV2ZW50cycsIHRoaXMuZXZlbnRzKTtcbiAgICAgIHV0aWxzLmZvckluKHRoaXMuZXZlbnRzLCBmdW5jdGlvbiAoZnVuYywgZXZlbnQpIHtcbiAgICAgICAgdmFyIGVsLCB0eXBlLCBwYXJ0cyA9IGV2ZW50LnNwbGl0KCcuJywgMik7XG4gICAgICAgIGlmIChwYXJ0cy5sZW5ndGggPT09IDEpIHtcbiAgICAgICAgICBlbCA9IHRoaXMuZWw7XG4gICAgICAgICAgdHlwZSA9IHBhcnRzWzBdO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGVsID0gdGhpcy51aVtwYXJ0c1swXV07XG4gICAgICAgICAgdHlwZSA9IHBhcnRzWzFdO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMubGlzdGVuVG8oZWwsIHR5cGUsIGZ1bmMpO1xuICAgICAgfSwgdGhpcyk7XG4gICAgfVxuICB9O1xuXG4gIHRoaXMudW5iaW5kRXZlbnRzID0gZnVuY3Rpb24gKCkge1xuICAgIGlmICh0aGlzLmV2ZW50cykge1xuICAgICAgdGhpcy50cmFjZSgndW5iaW5kaW5nIGV2ZW50cycsIHRoaXMuZXZlbnRzKTtcbiAgICAgIHV0aWxzLmZvckluKHRoaXMuZXZlbnRzLCBmdW5jdGlvbiAoZnVuYywgZXZlbnQpIHtcbiAgICAgICAgdmFyIGVsLCB0eXBlLCBwYXJ0cyA9IGV2ZW50LnNwbGl0KCcuJywgMik7XG4gICAgICAgIGlmIChwYXJ0cy5sZW5ndGggPT09IDEpIHtcbiAgICAgICAgICBlbCA9IHRoaXMuZWw7XG4gICAgICAgICAgdHlwZSA9IHBhcnRzWzBdO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGVsID0gdGhpcy51aVtwYXJ0c1swXV07XG4gICAgICAgICAgdHlwZSA9IHBhcnRzWzFdO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMuc3RvcExpc3RlbmluZyhlbCwgdHlwZSk7XG4gICAgICB9LCB0aGlzKTtcbiAgICB9XG4gIH07XG5cbiAgaWYgKCF1dGlscy5oYXModGhpcywgJ3JlbmRlcicpKSB7XG4gICAgdGhpcy5yZW5kZXIgPSBmdW5jdGlvbiAoZGF0YSkge1xuICAgICAgdmFyIGh0bWwgPSAnJywgZWwsIHNvdXJjZSA9ICcnO1xuICAgICAgaWYgKHRoaXMudGVtcGxhdGUpIHtcbiAgICAgICAgdGhpcy51bmJpbmRFdmVudHMoKTtcbiAgICAgICAgdGhpcy51bmJpbmRVSSgpO1xuICAgICAgICBpZiAodXRpbHMuaXNGdW5jdGlvbih0aGlzLnRlbXBsYXRlKSkge1xuICAgICAgICAgIGh0bWwgPSB0aGlzLnRlbXBsYXRlKGRhdGEpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGlmICh1dGlscy5oYXMoX3RlbXBsYXRlQ2FjaGUsIHRoaXMudGVtcGxhdGUpKSB7XG4gICAgICAgICAgICBzb3VyY2UgPSBfdGVtcGxhdGVDYWNoZVt0aGlzLnRlbXBsYXRlXTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgZWwgPSB1dGlscy5zZWxlY3RPbmUodGhpcy50ZW1wbGF0ZSk7XG4gICAgICAgICAgICBpZiAoIWVsKSB7IHRocm93IEVycm9yKCd0ZW1wbGF0ZSAnICsgdGhpcy50ZW1wbGF0ZSArICcgbm90IGZvdW5kJyk7IH1cbiAgICAgICAgICAgIHNvdXJjZSA9IGVsLmlubmVySFRNTDtcbiAgICAgICAgICAgIF90ZW1wbGF0ZUNhY2hlW3RoaXMudGVtcGxhdGVdID0gc291cmNlO1xuICAgICAgICAgIH1cbiAgICAgICAgICBodG1sID0gdXRpbHMudGVtcGxhdGUoc291cmNlLCBkYXRhIHx8IHt9KTtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLmVsLmlubmVySFRNTCA9IGh0bWw7XG4gICAgICAgIHRoaXMuYmluZFVJKCk7XG4gICAgICAgIHRoaXMuYmluZEV2ZW50cygpO1xuICAgICAgfVxuICAgIH07XG4gIH1cblxuICB0aGlzLnJlbW92ZSA9IGZ1bmN0aW9uICgpIHtcbiAgICB0aGlzLmVsLnBhcmVudE5vZGUucmVtb3ZlQ2hpbGQodGhpcy5lbCk7XG4gICAgdGhpcy5kZXN0cm95KCk7XG4gIH07XG5cbiAgdGhpcy5iZWZvcmUoJ2luaXRpYWxpemUnLCBmdW5jdGlvbiAoKSB7XG4gICAgdGhpcy5iaW5kVUkoKTtcbiAgICB0aGlzLmJpbmRFdmVudHMoKTtcbiAgfSk7XG59O1xuXG5tb2R1bGUuZXhwb3J0cyA9IFZpZXc7IiwidmFyIHV0aWxzID0gcmVxdWlyZSgnLi91dGlscycpO1xuXG52YXIgUmVnaXN0cnkgPSBmdW5jdGlvbiAoKSB7XG4gIHRoaXMuY29tcG9uZW50cyA9IHt9O1xuICB0aGlzLmluc3RhbmNlcyA9IHt9O1xuICB0aGlzLmluc3RhbmNlc0FsbCA9IHt9O1xufTtcblxuUmVnaXN0cnkucHJvdG90eXBlLmFkZENvbXBvbmVudCA9IGZ1bmN0aW9uIChjb21wb25lbnQpIHtcbiAgdmFyIHR5cGUgPSBjb21wb25lbnQucHJvdG90eXBlLnR5cGU7XG4gIC8vIGlmICh0aGlzLmNvbXBvbmVudHNbdHlwZV0pIHtcbiAgLy8gICB0aHJvdyBuZXcgRXJyb3IoJ2EgY29tcG9uZW50IHdpdGggdHlwZSAnICsgdHlwZSArICcgaXMgYWxyZWFkeSBkZWZpbmVkJyk7XG4gIC8vIH1cbiAgdGhpcy5jb21wb25lbnRzW3R5cGVdID0gY29tcG9uZW50O1xufTtcblxuUmVnaXN0cnkucHJvdG90eXBlLmFkZEluc3RhbmNlID0gZnVuY3Rpb24gKGluc3RhbmNlKSB7XG4gIGlmICh0aGlzLmluc3RhbmNlc0FsbFtpbnN0YW5jZS5pZF0pIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ2FuIGluc3RhbmNlIHdpdGggaWQgJyArIGluc3RhbmNlLmlkICsgJyBhbHJlYWR5IGV4aXN0cycpO1xuICB9XG4gIHRoaXMuaW5zdGFuY2VzQWxsW2luc3RhbmNlLmlkXSA9IGluc3RhbmNlO1xuICB0aGlzLmluc3RhbmNlc1tpbnN0YW5jZS50eXBlXSA9IHRoaXMuaW5zdGFuY2VzW2luc3RhbmNlLnR5cGVdIHx8IHt9O1xuICB0aGlzLmluc3RhbmNlc1tpbnN0YW5jZS50eXBlXVtpbnN0YW5jZS5pZF0gPSBpbnN0YW5jZTtcbn07XG5cblJlZ2lzdHJ5LnByb3RvdHlwZS5maW5kQ29tcG9uZW50ID0gZnVuY3Rpb24gKHR5cGUpIHtcbiAgcmV0dXJuIHRoaXMuY29tcG9uZW50c1t0eXBlXSB8fCBudWxsO1xufTtcblxuUmVnaXN0cnkucHJvdG90eXBlLmZpbmRJbnN0YW5jZSA9IGZ1bmN0aW9uIChpZCkge1xuICByZXR1cm4gdGhpcy5pbnN0YW5jZXNBbGxbaWRdIHx8IG51bGw7XG59O1xuXG5SZWdpc3RyeS5wcm90b3R5cGUuZmluZEluc3RhbmNlc09mID0gZnVuY3Rpb24gKGNvbXBvbmVudCkge1xuICB2YXIgdHlwZSA9IHV0aWxzLmlzU3RyaW5nKGNvbXBvbmVudCkgPyBjb21wb25lbnQgOiBjb21wb25lbnQudHlwZTtcbiAgcmV0dXJuIHV0aWxzLnZhbHVlcyh0aGlzLmluc3RhbmNlc1t0eXBlXSkgfHwgbnVsbDtcbn07XG5cblJlZ2lzdHJ5LnByb3RvdHlwZS5yZW1vdmVDb21wb25lbnQgPSBmdW5jdGlvbiAoY29tcG9uZW50KSB7XG4gIHZhciB0eXBlID0gdXRpbHMuaXNTdHJpbmcoY29tcG9uZW50KSA/IGNvbXBvbmVudCA6IGNvbXBvbmVudC50eXBlO1xuICBkZWxldGUgdGhpcy5jb21wb25lbnRzW3R5cGVdO1xufTtcblxuUmVnaXN0cnkucHJvdG90eXBlLnJlbW92ZUluc3RhbmNlID0gZnVuY3Rpb24gKGluc3RhbmNlKSB7XG4gIHZhciBpZCA9IHV0aWxzLmlzU3RyaW5nKGluc3RhbmNlKSA/IGluc3RhbmNlIDogaW5zdGFuY2UuaWQ7XG4gIGluc3RhbmNlID0gdGhpcy5pbnN0YW5jZXNBbGxbaWRdO1xuICBkZWxldGUgdGhpcy5pbnN0YW5jZXNBbGxbaWRdO1xuICBkZWxldGUgdGhpcy5pbnN0YW5jZXNbaW5zdGFuY2UudHlwZV1baWRdO1xufTtcblxuUmVnaXN0cnkucHJvdG90eXBlLnJlbW92ZUluc3RhbmNlc09mID0gZnVuY3Rpb24gKGNvbXBvbmVudCkge1xuICB2YXIgdHlwZSA9IHV0aWxzLmlzU3RyaW5nKGNvbXBvbmVudCkgPyBjb21wb25lbnQgOiBjb21wb25lbnQudHlwZTtcbiAgdmFyIGluc3RhbmNlcyA9IHRoaXMuaW5zdGFuY2VzW3R5cGVdO1xuICBmb3IgKHZhciBpZCBpbiBpbnN0YW5jZXMpIHtcbiAgICBkZWxldGUgdGhpcy5pbnN0YW5jZXNBbGxbaWRdO1xuICB9XG4gIGRlbGV0ZSB0aGlzLmluc3RhbmNlc1t0eXBlXTtcbn07XG5cbm1vZHVsZS5leHBvcnRzID0gbmV3IFJlZ2lzdHJ5KCk7IiwiLyogZ2xvYmFsIF8gKi9cbmlmICgndW5kZWZpbmVkJyAhPT0gdHlwZW9mIF8pIHtcbiAgZXhwb3J0cy5vbWl0ID0gXy5vbWl0O1xuICBleHBvcnRzLnBpY2sgPSBfLnBpY2s7XG4gIGV4cG9ydHMuaGFzID0gXy5oYXM7XG4gIGV4cG9ydHMuZGVmYXVsdHMgPSBfLmRlZmF1bHRzO1xuICBleHBvcnRzLmlzU3RyaW5nID0gXy5pc1N0cmluZztcbiAgZXhwb3J0cy5pc0FycmF5ID0gXy5pc0FycmF5O1xuICBleHBvcnRzLmlzRnVuY3Rpb24gPSBfLmlzRnVuY3Rpb247XG4gIGV4cG9ydHMuZm9ySW4gPSBfLmZvckluO1xuICBleHBvcnRzLnZhbHVlcyA9IF8udmFsdWVzO1xuICBleHBvcnRzLmNyZWF0ZSA9IF8uY3JlYXRlO1xuICBleHBvcnRzLnJlc3VsdCA9IF8ucmVzdWx0O1xuICBleHBvcnRzLnVuaXF1ZUlkID0gXy51bmlxdWVJZDtcbiAgZXhwb3J0cy5ub29wID0gXy5ub29wO1xuICBleHBvcnRzLnRlbXBsYXRlID0gXy50ZW1wbGF0ZTtcbiAgZXhwb3J0cy53cmFwID0gXy53cmFwO1xuICBleHBvcnRzLmJpbmQgPSBfLmJpbmQ7XG4gIGV4cG9ydHMuYmluZEFsbCA9IF8uYmluZEFsbDtcbiAgZXhwb3J0cy5mb3JFYWNoID0gXy5mb3JFYWNoO1xuICBleHBvcnRzLm1hcCA9IF8ubWFwO1xufSIsImV4cG9ydHMub21pdCA9IHJlcXVpcmUoJ2xvZGFzaC1ub2RlL21vZGVybi9vYmplY3RzL29taXQnKTtcbmV4cG9ydHMucGljayA9IHJlcXVpcmUoJ2xvZGFzaC1ub2RlL21vZGVybi9vYmplY3RzL3BpY2snKTtcbmV4cG9ydHMuaGFzID0gcmVxdWlyZSgnbG9kYXNoLW5vZGUvbW9kZXJuL29iamVjdHMvaGFzJyk7XG5leHBvcnRzLmRlZmF1bHRzID0gcmVxdWlyZSgnbG9kYXNoLW5vZGUvbW9kZXJuL29iamVjdHMvZGVmYXVsdHMnKTtcbmV4cG9ydHMuaXNTdHJpbmcgPSByZXF1aXJlKCdsb2Rhc2gtbm9kZS9tb2Rlcm4vb2JqZWN0cy9pc1N0cmluZycpO1xuZXhwb3J0cy5pc0FycmF5ID0gcmVxdWlyZSgnbG9kYXNoLW5vZGUvbW9kZXJuL29iamVjdHMvaXNBcnJheScpO1xuZXhwb3J0cy5pc0Z1bmN0aW9uID0gcmVxdWlyZSgnbG9kYXNoLW5vZGUvbW9kZXJuL29iamVjdHMvaXNGdW5jdGlvbicpO1xuZXhwb3J0cy5mb3JJbiA9IHJlcXVpcmUoJ2xvZGFzaC1ub2RlL21vZGVybi9vYmplY3RzL2ZvckluJyk7XG5leHBvcnRzLnZhbHVlcyA9IHJlcXVpcmUoJ2xvZGFzaC1ub2RlL21vZGVybi9vYmplY3RzL3ZhbHVlcycpO1xuZXhwb3J0cy5jcmVhdGUgPSByZXF1aXJlKCdsb2Rhc2gtbm9kZS9tb2Rlcm4vb2JqZWN0cy9jcmVhdGUnKTtcbmV4cG9ydHMucmVzdWx0ID0gcmVxdWlyZSgnbG9kYXNoLW5vZGUvbW9kZXJuL3V0aWxpdGllcy9yZXN1bHQnKTtcbmV4cG9ydHMudW5pcXVlSWQgPSByZXF1aXJlKCdsb2Rhc2gtbm9kZS9tb2Rlcm4vdXRpbGl0aWVzL3VuaXF1ZUlkJyk7XG5leHBvcnRzLm5vb3AgPSByZXF1aXJlKCdsb2Rhc2gtbm9kZS9tb2Rlcm4vdXRpbGl0aWVzL25vb3AnKTtcbmV4cG9ydHMudGVtcGxhdGUgPSByZXF1aXJlKCdsb2Rhc2gtbm9kZS9tb2Rlcm4vdXRpbGl0aWVzL3RlbXBsYXRlJyk7XG5leHBvcnRzLndyYXAgPSByZXF1aXJlKCdsb2Rhc2gtbm9kZS9tb2Rlcm4vZnVuY3Rpb25zL3dyYXAnKTtcbmV4cG9ydHMuYmluZCA9IHJlcXVpcmUoJ2xvZGFzaC1ub2RlL21vZGVybi9mdW5jdGlvbnMvYmluZCcpO1xuZXhwb3J0cy5iaW5kQWxsID0gcmVxdWlyZSgnbG9kYXNoLW5vZGUvbW9kZXJuL2Z1bmN0aW9ucy9iaW5kQWxsJyk7XG5leHBvcnRzLmZvckVhY2ggPSByZXF1aXJlKCdsb2Rhc2gtbm9kZS9tb2Rlcm4vY29sbGVjdGlvbnMvZm9yRWFjaCcpO1xuZXhwb3J0cy5tYXAgPSByZXF1aXJlKCdsb2Rhc2gtbm9kZS9tb2Rlcm4vY29sbGVjdGlvbnMvbWFwJyk7IiwiXG5leHBvcnRzLmRlZmluZSA9IGZ1bmN0aW9uIChwcm9wZXJ0aWVzIC8qLCBtaXhpbnMuLi4gKi8pIHtcbiAgdmFyIGNoaWxkLCBtaXhpbnMgPSBbXSwgcGFyZW50ID0gdGhpcztcbiAgaWYgKHByb3BlcnRpZXMgJiYgZXhwb3J0cy5oYXMocHJvcGVydGllcywgJ2NvbnN0cnVjdG9yJykpIHtcbiAgICBjaGlsZCA9IHByb3BlcnRpZXMuY29uc3RydWN0b3I7XG4gIH0gZWxzZSB7XG4gICAgY2hpbGQgPSBmdW5jdGlvbiAoKSB7IHJldHVybiBwYXJlbnQuYXBwbHkodGhpcywgYXJndW1lbnRzKTsgfTtcbiAgfVxuICBjaGlsZC5wcm90b3R5cGUgPSBleHBvcnRzLmNyZWF0ZShwYXJlbnQucHJvdG90eXBlLCBwcm9wZXJ0aWVzKTtcbiAgZXhwb3J0cy5leHRlbmQoY2hpbGQsIHBhcmVudCk7XG4gIGV4cG9ydHMuYmluZEFsbChjaGlsZCk7XG4gIGlmIChhcmd1bWVudHMubGVuZ3RoID4gMSkge1xuICAgIG1peGlucyA9IG5ldyBBcnJheShhcmd1bWVudHMubGVuZ3RoIC0gMSk7XG4gICAgZm9yICh2YXIgaSA9IDEsIGwgPSBtaXhpbnMubGVuZ3RoOyBpIDw9IGw7IGkrKykge1xuICAgICAgbWl4aW5zW2kgLSAxXSA9IGFyZ3VtZW50c1tpXTtcbiAgICB9XG4gIH1cbiAgZXhwb3J0cy5taXhpbi5jYWxsKGNoaWxkLnByb3RvdHlwZSwgbWl4aW5zKTtcbiAgcmV0dXJuIGNoaWxkO1xufTtcblxuZXhwb3J0cy5taXhpbiA9IGZ1bmN0aW9uIChtaXhpbnMpIHtcbiAgaWYgKCFtaXhpbnMpIHsgcmV0dXJuOyB9XG4gIHRoaXMuX21peGlucyA9IGV4cG9ydHMuaGFzKHRoaXMsICdfbWl4aW5zJykgPyB0aGlzLl9taXhpbnMgOiBbXTtcbiAgZXhwb3J0cy5mb3JFYWNoKG1peGlucywgZnVuY3Rpb24gKG1peGluKSB7XG4gICAgaWYgKHRoaXMuX21peGlucy5pbmRleE9mKG1peGluKSA9PT0gLTEpIHtcbiAgICAgIG1peGluLmNhbGwodGhpcyk7XG4gICAgICB0aGlzLl9taXhpbnMucHVzaChtaXhpbik7XG4gICAgfVxuICB9LCB0aGlzKTtcbn07XG5cbmV4cG9ydHMuZG9jdW1lbnRSZWFkeSA9IGZ1bmN0aW9uIChmdW5jKSB7XG4gIGlmIChkb2N1bWVudC5yZWFkeVN0YXRlID09PSAnY29tcGxldGUnIHx8XG4gICAgICBkb2N1bWVudC5yZWFkeVN0YXRlID09PSAnbG9hZGVkJyB8fFxuICAgICAgZG9jdW1lbnQucmVhZHlTdGF0ZSA9PT0gJ2ludGVyYWN0aXZlJykge1xuICAgIGZ1bmMoKTtcbiAgfSBlbHNlIHtcbiAgICB3aW5kb3cuZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcignRE9NQ29udGVudExvYWRlZCcsIGZ1bmMpO1xuICB9XG59O1xuXG5leHBvcnRzLnNlbGVjdCA9IGZ1bmN0aW9uIChlbCwgc2VsZWN0b3IsIG9uZSkge1xuICBpZiAoJ3VuZGVmaW5lZCcgPT09IG9uZSkge1xuICAgIG9uZSA9IHNlbGVjdG9yIHx8IGZhbHNlO1xuICAgIHNlbGVjdG9yID0gZWw7XG4gICAgZWwgPSBudWxsO1xuICB9XG4gIGlmICghc2VsZWN0b3IpIHtcbiAgICBzZWxlY3RvciA9IGVsO1xuICAgIGVsID0gbnVsbDtcbiAgfVxuICBlbCA9IGVsIHx8IHdpbmRvdy5kb2N1bWVudDtcbiAgcmV0dXJuIG9uZSA/IGVsLnF1ZXJ5U2VsZWN0b3Ioc2VsZWN0b3IpIDogZWwucXVlcnlTZWxlY3RvckFsbChzZWxlY3Rvcik7XG59O1xuXG5leHBvcnRzLnNlbGVjdE9uZSA9IGZ1bmN0aW9uIChlbCwgc2VsZWN0b3IpIHtcbiAgcmV0dXJuIGV4cG9ydHMuc2VsZWN0KGVsLCBzZWxlY3RvciwgdHJ1ZSk7XG59O1xuXG5leHBvcnRzLm1hdGNoZXMgPSBmdW5jdGlvbihlbCwgc2VsZWN0b3IpIHtcbiAgLy8gYm9ycm93ZWQgZnJvbSBodHRwOi8veW91bWlnaHRub3RuZWVkanF1ZXJ5LmNvbS9cbiAgdmFyIF9tYXRjaGVzID0gKGVsLm1hdGNoZXMgfHwgZWwubWF0Y2hlc1NlbGVjdG9yIHx8IGVsLm1zTWF0Y2hlc1NlbGVjdG9yIHx8IGVsLm1vek1hdGNoZXNTZWxlY3RvciB8fCBlbC53ZWJraXRNYXRjaGVzU2VsZWN0b3IgfHwgZWwub01hdGNoZXNTZWxlY3Rvcik7XG4gIGlmIChfbWF0Y2hlcykge1xuICAgIHJldHVybiBfbWF0Y2hlcy5jYWxsKGVsLCBzZWxlY3Rvcik7XG4gIH0gZWxzZSB7XG4gICAgdmFyIG5vZGVzID0gZWwucGFyZW50Tm9kZS5xdWVyeVNlbGVjdG9yQWxsKHNlbGVjdG9yKTtcbiAgICBmb3IgKHZhciBpID0gbm9kZXMubGVuZ3RoOyBpLS07KSB7XG4gICAgICBpZiAobm9kZXNbaV0gPT09IGVsKSB7IHJldHVybiB0cnVlOyB9XG4gICAgfVxuICAgIHJldHVybiBmYWxzZTtcbiAgfVxufTtcblxuZXhwb3J0cy5jcmVhdGVFdmVudCA9IGZ1bmN0aW9uICh0eXBlLCBkYXRhLCBvcHRpb25zKSB7XG4gIHZhciBlO1xuICBvcHRpb25zID0gb3B0aW9ucyB8fCB7IGJ1YmJsZXM6IGZhbHNlLCBjYW5jZWxhYmxlOiBmYWxzZX07XG4gIGlmICh0eXBlb2YgQ3VzdG9tRXZlbnQgPT09ICdmdW5jdGlvbicpIHtcbiAgICBlID0gbmV3IEN1c3RvbUV2ZW50KHR5cGUsXG4gICAgICB7ZGV0YWlsOiBkYXRhLCBidWJibGVzOiBvcHRpb25zLmJ1YmJsZXMsIGNhbmNlbGFibGU6IG9wdGlvbnMuY2FuY2VsYWJsZX1cbiAgICApO1xuICB9IGVsc2Uge1xuICAgIGUgPSB3aW5kb3cuZG9jdW1lbnQuY3JlYXRlRXZlbnQoJ0N1c3RvbUV2ZW50Jyk7XG4gICAgZS5pbml0Q3VzdG9tRXZlbnQodHlwZSwgb3B0aW9ucy5idWJibGVzLCBvcHRpb25zLmNhbmNlbGFibGUsIGRhdGEpO1xuICB9XG4gIHJldHVybiBlO1xufTtcblxuZXhwb3J0cy5jcmVhdGVFbGVtZW50ID0gcmVxdWlyZSgnZG9taWZ5Jyk7XG5leHBvcnRzLmV4dGVuZCA9IHJlcXVpcmUoJ2xvZGFzaC1ub2RlL21vZGVybi9vYmplY3RzL2Fzc2lnbicpO1xuZXhwb3J0cy5leHRlbmQoZXhwb3J0cywgcmVxdWlyZSgnLi91dGlscy1leHQtZ2xvYmFsJykpO1xuZXhwb3J0cy5leHRlbmQoZXhwb3J0cywgcmVxdWlyZSgnLi91dGlscy1leHQtcmVxdWlyZScpKTsiLCJcbi8qKlxuICogRXhwb3NlIGBwYXJzZWAuXG4gKi9cblxubW9kdWxlLmV4cG9ydHMgPSBwYXJzZTtcblxuLyoqXG4gKiBXcmFwIG1hcCBmcm9tIGpxdWVyeS5cbiAqL1xuXG52YXIgbWFwID0ge1xuICBsZWdlbmQ6IFsxLCAnPGZpZWxkc2V0PicsICc8L2ZpZWxkc2V0PiddLFxuICB0cjogWzIsICc8dGFibGU+PHRib2R5PicsICc8L3Rib2R5PjwvdGFibGU+J10sXG4gIGNvbDogWzIsICc8dGFibGU+PHRib2R5PjwvdGJvZHk+PGNvbGdyb3VwPicsICc8L2NvbGdyb3VwPjwvdGFibGU+J10sXG4gIF9kZWZhdWx0OiBbMCwgJycsICcnXVxufTtcblxubWFwLnRkID1cbm1hcC50aCA9IFszLCAnPHRhYmxlPjx0Ym9keT48dHI+JywgJzwvdHI+PC90Ym9keT48L3RhYmxlPiddO1xuXG5tYXAub3B0aW9uID1cbm1hcC5vcHRncm91cCA9IFsxLCAnPHNlbGVjdCBtdWx0aXBsZT1cIm11bHRpcGxlXCI+JywgJzwvc2VsZWN0PiddO1xuXG5tYXAudGhlYWQgPVxubWFwLnRib2R5ID1cbm1hcC5jb2xncm91cCA9XG5tYXAuY2FwdGlvbiA9XG5tYXAudGZvb3QgPSBbMSwgJzx0YWJsZT4nLCAnPC90YWJsZT4nXTtcblxubWFwLnRleHQgPVxubWFwLmNpcmNsZSA9XG5tYXAuZWxsaXBzZSA9XG5tYXAubGluZSA9XG5tYXAucGF0aCA9XG5tYXAucG9seWdvbiA9XG5tYXAucG9seWxpbmUgPVxubWFwLnJlY3QgPSBbMSwgJzxzdmcgeG1sbnM9XCJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2Z1wiIHZlcnNpb249XCIxLjFcIj4nLCc8L3N2Zz4nXTtcblxuLyoqXG4gKiBQYXJzZSBgaHRtbGAgYW5kIHJldHVybiB0aGUgY2hpbGRyZW4uXG4gKlxuICogQHBhcmFtIHtTdHJpbmd9IGh0bWxcbiAqIEByZXR1cm4ge0FycmF5fVxuICogQGFwaSBwcml2YXRlXG4gKi9cblxuZnVuY3Rpb24gcGFyc2UoaHRtbCkge1xuICBpZiAoJ3N0cmluZycgIT0gdHlwZW9mIGh0bWwpIHRocm93IG5ldyBUeXBlRXJyb3IoJ1N0cmluZyBleHBlY3RlZCcpO1xuICBcbiAgLy8gdGFnIG5hbWVcbiAgdmFyIG0gPSAvPChbXFx3Ol0rKS8uZXhlYyhodG1sKTtcbiAgaWYgKCFtKSByZXR1cm4gZG9jdW1lbnQuY3JlYXRlVGV4dE5vZGUoaHRtbCk7XG5cbiAgaHRtbCA9IGh0bWwucmVwbGFjZSgvXlxccyt8XFxzKyQvZywgJycpOyAvLyBSZW1vdmUgbGVhZGluZy90cmFpbGluZyB3aGl0ZXNwYWNlXG5cbiAgdmFyIHRhZyA9IG1bMV07XG5cbiAgLy8gYm9keSBzdXBwb3J0XG4gIGlmICh0YWcgPT0gJ2JvZHknKSB7XG4gICAgdmFyIGVsID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnaHRtbCcpO1xuICAgIGVsLmlubmVySFRNTCA9IGh0bWw7XG4gICAgcmV0dXJuIGVsLnJlbW92ZUNoaWxkKGVsLmxhc3RDaGlsZCk7XG4gIH1cblxuICAvLyB3cmFwIG1hcFxuICB2YXIgd3JhcCA9IG1hcFt0YWddIHx8IG1hcC5fZGVmYXVsdDtcbiAgdmFyIGRlcHRoID0gd3JhcFswXTtcbiAgdmFyIHByZWZpeCA9IHdyYXBbMV07XG4gIHZhciBzdWZmaXggPSB3cmFwWzJdO1xuICB2YXIgZWwgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcbiAgZWwuaW5uZXJIVE1MID0gcHJlZml4ICsgaHRtbCArIHN1ZmZpeDtcbiAgd2hpbGUgKGRlcHRoLS0pIGVsID0gZWwubGFzdENoaWxkO1xuXG4gIC8vIG9uZSBlbGVtZW50XG4gIGlmIChlbC5maXJzdENoaWxkID09IGVsLmxhc3RDaGlsZCkge1xuICAgIHJldHVybiBlbC5yZW1vdmVDaGlsZChlbC5maXJzdENoaWxkKTtcbiAgfVxuXG4gIC8vIHNldmVyYWwgZWxlbWVudHNcbiAgdmFyIGZyYWdtZW50ID0gZG9jdW1lbnQuY3JlYXRlRG9jdW1lbnRGcmFnbWVudCgpO1xuICB3aGlsZSAoZWwuZmlyc3RDaGlsZCkge1xuICAgIGZyYWdtZW50LmFwcGVuZENoaWxkKGVsLnJlbW92ZUNoaWxkKGVsLmZpcnN0Q2hpbGQpKTtcbiAgfVxuXG4gIHJldHVybiBmcmFnbWVudDtcbn1cbiIsIi8qKlxuICogTG8tRGFzaCAyLjQuMSAoQ3VzdG9tIEJ1aWxkKSA8aHR0cDovL2xvZGFzaC5jb20vPlxuICogQnVpbGQ6IGBsb2Rhc2ggbW9kdWxhcml6ZSBtb2Rlcm4gZXhwb3J0cz1cIm5vZGVcIiAtbyAuL21vZGVybi9gXG4gKiBDb3B5cmlnaHQgMjAxMi0yMDEzIFRoZSBEb2pvIEZvdW5kYXRpb24gPGh0dHA6Ly9kb2pvZm91bmRhdGlvbi5vcmcvPlxuICogQmFzZWQgb24gVW5kZXJzY29yZS5qcyAxLjUuMiA8aHR0cDovL3VuZGVyc2NvcmVqcy5vcmcvTElDRU5TRT5cbiAqIENvcHlyaWdodCAyMDA5LTIwMTMgSmVyZW15IEFzaGtlbmFzLCBEb2N1bWVudENsb3VkIGFuZCBJbnZlc3RpZ2F0aXZlIFJlcG9ydGVycyAmIEVkaXRvcnNcbiAqIEF2YWlsYWJsZSB1bmRlciBNSVQgbGljZW5zZSA8aHR0cDovL2xvZGFzaC5jb20vbGljZW5zZT5cbiAqL1xudmFyIGJhc2VDcmVhdGVDYWxsYmFjayA9IHJlcXVpcmUoJy4uL2ludGVybmFscy9iYXNlQ3JlYXRlQ2FsbGJhY2snKSxcbiAgICBmb3JPd24gPSByZXF1aXJlKCcuLi9vYmplY3RzL2Zvck93bicpO1xuXG4vKipcbiAqIEl0ZXJhdGVzIG92ZXIgZWxlbWVudHMgb2YgYSBjb2xsZWN0aW9uLCBleGVjdXRpbmcgdGhlIGNhbGxiYWNrIGZvciBlYWNoXG4gKiBlbGVtZW50LiBUaGUgY2FsbGJhY2sgaXMgYm91bmQgdG8gYHRoaXNBcmdgIGFuZCBpbnZva2VkIHdpdGggdGhyZWUgYXJndW1lbnRzO1xuICogKHZhbHVlLCBpbmRleHxrZXksIGNvbGxlY3Rpb24pLiBDYWxsYmFja3MgbWF5IGV4aXQgaXRlcmF0aW9uIGVhcmx5IGJ5XG4gKiBleHBsaWNpdGx5IHJldHVybmluZyBgZmFsc2VgLlxuICpcbiAqIE5vdGU6IEFzIHdpdGggb3RoZXIgXCJDb2xsZWN0aW9uc1wiIG1ldGhvZHMsIG9iamVjdHMgd2l0aCBhIGBsZW5ndGhgIHByb3BlcnR5XG4gKiBhcmUgaXRlcmF0ZWQgbGlrZSBhcnJheXMuIFRvIGF2b2lkIHRoaXMgYmVoYXZpb3IgYF8uZm9ySW5gIG9yIGBfLmZvck93bmBcbiAqIG1heSBiZSB1c2VkIGZvciBvYmplY3QgaXRlcmF0aW9uLlxuICpcbiAqIEBzdGF0aWNcbiAqIEBtZW1iZXJPZiBfXG4gKiBAYWxpYXMgZWFjaFxuICogQGNhdGVnb3J5IENvbGxlY3Rpb25zXG4gKiBAcGFyYW0ge0FycmF5fE9iamVjdHxzdHJpbmd9IGNvbGxlY3Rpb24gVGhlIGNvbGxlY3Rpb24gdG8gaXRlcmF0ZSBvdmVyLlxuICogQHBhcmFtIHtGdW5jdGlvbn0gW2NhbGxiYWNrPWlkZW50aXR5XSBUaGUgZnVuY3Rpb24gY2FsbGVkIHBlciBpdGVyYXRpb24uXG4gKiBAcGFyYW0geyp9IFt0aGlzQXJnXSBUaGUgYHRoaXNgIGJpbmRpbmcgb2YgYGNhbGxiYWNrYC5cbiAqIEByZXR1cm5zIHtBcnJheXxPYmplY3R8c3RyaW5nfSBSZXR1cm5zIGBjb2xsZWN0aW9uYC5cbiAqIEBleGFtcGxlXG4gKlxuICogXyhbMSwgMiwgM10pLmZvckVhY2goZnVuY3Rpb24obnVtKSB7IGNvbnNvbGUubG9nKG51bSk7IH0pLmpvaW4oJywnKTtcbiAqIC8vID0+IGxvZ3MgZWFjaCBudW1iZXIgYW5kIHJldHVybnMgJzEsMiwzJ1xuICpcbiAqIF8uZm9yRWFjaCh7ICdvbmUnOiAxLCAndHdvJzogMiwgJ3RocmVlJzogMyB9LCBmdW5jdGlvbihudW0pIHsgY29uc29sZS5sb2cobnVtKTsgfSk7XG4gKiAvLyA9PiBsb2dzIGVhY2ggbnVtYmVyIGFuZCByZXR1cm5zIHRoZSBvYmplY3QgKHByb3BlcnR5IG9yZGVyIGlzIG5vdCBndWFyYW50ZWVkIGFjcm9zcyBlbnZpcm9ubWVudHMpXG4gKi9cbmZ1bmN0aW9uIGZvckVhY2goY29sbGVjdGlvbiwgY2FsbGJhY2ssIHRoaXNBcmcpIHtcbiAgdmFyIGluZGV4ID0gLTEsXG4gICAgICBsZW5ndGggPSBjb2xsZWN0aW9uID8gY29sbGVjdGlvbi5sZW5ndGggOiAwO1xuXG4gIGNhbGxiYWNrID0gY2FsbGJhY2sgJiYgdHlwZW9mIHRoaXNBcmcgPT0gJ3VuZGVmaW5lZCcgPyBjYWxsYmFjayA6IGJhc2VDcmVhdGVDYWxsYmFjayhjYWxsYmFjaywgdGhpc0FyZywgMyk7XG4gIGlmICh0eXBlb2YgbGVuZ3RoID09ICdudW1iZXInKSB7XG4gICAgd2hpbGUgKCsraW5kZXggPCBsZW5ndGgpIHtcbiAgICAgIGlmIChjYWxsYmFjayhjb2xsZWN0aW9uW2luZGV4XSwgaW5kZXgsIGNvbGxlY3Rpb24pID09PSBmYWxzZSkge1xuICAgICAgICBicmVhaztcbiAgICAgIH1cbiAgICB9XG4gIH0gZWxzZSB7XG4gICAgZm9yT3duKGNvbGxlY3Rpb24sIGNhbGxiYWNrKTtcbiAgfVxuICByZXR1cm4gY29sbGVjdGlvbjtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBmb3JFYWNoO1xuIiwiLyoqXG4gKiBMby1EYXNoIDIuNC4xIChDdXN0b20gQnVpbGQpIDxodHRwOi8vbG9kYXNoLmNvbS8+XG4gKiBCdWlsZDogYGxvZGFzaCBtb2R1bGFyaXplIG1vZGVybiBleHBvcnRzPVwibm9kZVwiIC1vIC4vbW9kZXJuL2BcbiAqIENvcHlyaWdodCAyMDEyLTIwMTMgVGhlIERvam8gRm91bmRhdGlvbiA8aHR0cDovL2Rvam9mb3VuZGF0aW9uLm9yZy8+XG4gKiBCYXNlZCBvbiBVbmRlcnNjb3JlLmpzIDEuNS4yIDxodHRwOi8vdW5kZXJzY29yZWpzLm9yZy9MSUNFTlNFPlxuICogQ29weXJpZ2h0IDIwMDktMjAxMyBKZXJlbXkgQXNoa2VuYXMsIERvY3VtZW50Q2xvdWQgYW5kIEludmVzdGlnYXRpdmUgUmVwb3J0ZXJzICYgRWRpdG9yc1xuICogQXZhaWxhYmxlIHVuZGVyIE1JVCBsaWNlbnNlIDxodHRwOi8vbG9kYXNoLmNvbS9saWNlbnNlPlxuICovXG52YXIgY3JlYXRlQ2FsbGJhY2sgPSByZXF1aXJlKCcuLi9mdW5jdGlvbnMvY3JlYXRlQ2FsbGJhY2snKSxcbiAgICBmb3JPd24gPSByZXF1aXJlKCcuLi9vYmplY3RzL2Zvck93bicpO1xuXG4vKipcbiAqIENyZWF0ZXMgYW4gYXJyYXkgb2YgdmFsdWVzIGJ5IHJ1bm5pbmcgZWFjaCBlbGVtZW50IGluIHRoZSBjb2xsZWN0aW9uXG4gKiB0aHJvdWdoIHRoZSBjYWxsYmFjay4gVGhlIGNhbGxiYWNrIGlzIGJvdW5kIHRvIGB0aGlzQXJnYCBhbmQgaW52b2tlZCB3aXRoXG4gKiB0aHJlZSBhcmd1bWVudHM7ICh2YWx1ZSwgaW5kZXh8a2V5LCBjb2xsZWN0aW9uKS5cbiAqXG4gKiBJZiBhIHByb3BlcnR5IG5hbWUgaXMgcHJvdmlkZWQgZm9yIGBjYWxsYmFja2AgdGhlIGNyZWF0ZWQgXCJfLnBsdWNrXCIgc3R5bGVcbiAqIGNhbGxiYWNrIHdpbGwgcmV0dXJuIHRoZSBwcm9wZXJ0eSB2YWx1ZSBvZiB0aGUgZ2l2ZW4gZWxlbWVudC5cbiAqXG4gKiBJZiBhbiBvYmplY3QgaXMgcHJvdmlkZWQgZm9yIGBjYWxsYmFja2AgdGhlIGNyZWF0ZWQgXCJfLndoZXJlXCIgc3R5bGUgY2FsbGJhY2tcbiAqIHdpbGwgcmV0dXJuIGB0cnVlYCBmb3IgZWxlbWVudHMgdGhhdCBoYXZlIHRoZSBwcm9wZXJ0aWVzIG9mIHRoZSBnaXZlbiBvYmplY3QsXG4gKiBlbHNlIGBmYWxzZWAuXG4gKlxuICogQHN0YXRpY1xuICogQG1lbWJlck9mIF9cbiAqIEBhbGlhcyBjb2xsZWN0XG4gKiBAY2F0ZWdvcnkgQ29sbGVjdGlvbnNcbiAqIEBwYXJhbSB7QXJyYXl8T2JqZWN0fHN0cmluZ30gY29sbGVjdGlvbiBUaGUgY29sbGVjdGlvbiB0byBpdGVyYXRlIG92ZXIuXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufE9iamVjdHxzdHJpbmd9IFtjYWxsYmFjaz1pZGVudGl0eV0gVGhlIGZ1bmN0aW9uIGNhbGxlZFxuICogIHBlciBpdGVyYXRpb24uIElmIGEgcHJvcGVydHkgbmFtZSBvciBvYmplY3QgaXMgcHJvdmlkZWQgaXQgd2lsbCBiZSB1c2VkXG4gKiAgdG8gY3JlYXRlIGEgXCJfLnBsdWNrXCIgb3IgXCJfLndoZXJlXCIgc3R5bGUgY2FsbGJhY2ssIHJlc3BlY3RpdmVseS5cbiAqIEBwYXJhbSB7Kn0gW3RoaXNBcmddIFRoZSBgdGhpc2AgYmluZGluZyBvZiBgY2FsbGJhY2tgLlxuICogQHJldHVybnMge0FycmF5fSBSZXR1cm5zIGEgbmV3IGFycmF5IG9mIHRoZSByZXN1bHRzIG9mIGVhY2ggYGNhbGxiYWNrYCBleGVjdXRpb24uXG4gKiBAZXhhbXBsZVxuICpcbiAqIF8ubWFwKFsxLCAyLCAzXSwgZnVuY3Rpb24obnVtKSB7IHJldHVybiBudW0gKiAzOyB9KTtcbiAqIC8vID0+IFszLCA2LCA5XVxuICpcbiAqIF8ubWFwKHsgJ29uZSc6IDEsICd0d28nOiAyLCAndGhyZWUnOiAzIH0sIGZ1bmN0aW9uKG51bSkgeyByZXR1cm4gbnVtICogMzsgfSk7XG4gKiAvLyA9PiBbMywgNiwgOV0gKHByb3BlcnR5IG9yZGVyIGlzIG5vdCBndWFyYW50ZWVkIGFjcm9zcyBlbnZpcm9ubWVudHMpXG4gKlxuICogdmFyIGNoYXJhY3RlcnMgPSBbXG4gKiAgIHsgJ25hbWUnOiAnYmFybmV5JywgJ2FnZSc6IDM2IH0sXG4gKiAgIHsgJ25hbWUnOiAnZnJlZCcsICAgJ2FnZSc6IDQwIH1cbiAqIF07XG4gKlxuICogLy8gdXNpbmcgXCJfLnBsdWNrXCIgY2FsbGJhY2sgc2hvcnRoYW5kXG4gKiBfLm1hcChjaGFyYWN0ZXJzLCAnbmFtZScpO1xuICogLy8gPT4gWydiYXJuZXknLCAnZnJlZCddXG4gKi9cbmZ1bmN0aW9uIG1hcChjb2xsZWN0aW9uLCBjYWxsYmFjaywgdGhpc0FyZykge1xuICB2YXIgaW5kZXggPSAtMSxcbiAgICAgIGxlbmd0aCA9IGNvbGxlY3Rpb24gPyBjb2xsZWN0aW9uLmxlbmd0aCA6IDA7XG5cbiAgY2FsbGJhY2sgPSBjcmVhdGVDYWxsYmFjayhjYWxsYmFjaywgdGhpc0FyZywgMyk7XG4gIGlmICh0eXBlb2YgbGVuZ3RoID09ICdudW1iZXInKSB7XG4gICAgdmFyIHJlc3VsdCA9IEFycmF5KGxlbmd0aCk7XG4gICAgd2hpbGUgKCsraW5kZXggPCBsZW5ndGgpIHtcbiAgICAgIHJlc3VsdFtpbmRleF0gPSBjYWxsYmFjayhjb2xsZWN0aW9uW2luZGV4XSwgaW5kZXgsIGNvbGxlY3Rpb24pO1xuICAgIH1cbiAgfSBlbHNlIHtcbiAgICByZXN1bHQgPSBbXTtcbiAgICBmb3JPd24oY29sbGVjdGlvbiwgZnVuY3Rpb24odmFsdWUsIGtleSwgY29sbGVjdGlvbikge1xuICAgICAgcmVzdWx0WysraW5kZXhdID0gY2FsbGJhY2sodmFsdWUsIGtleSwgY29sbGVjdGlvbik7XG4gICAgfSk7XG4gIH1cbiAgcmV0dXJuIHJlc3VsdDtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBtYXA7XG4iLCIvKipcbiAqIExvLURhc2ggMi40LjEgKEN1c3RvbSBCdWlsZCkgPGh0dHA6Ly9sb2Rhc2guY29tLz5cbiAqIEJ1aWxkOiBgbG9kYXNoIG1vZHVsYXJpemUgbW9kZXJuIGV4cG9ydHM9XCJub2RlXCIgLW8gLi9tb2Rlcm4vYFxuICogQ29weXJpZ2h0IDIwMTItMjAxMyBUaGUgRG9qbyBGb3VuZGF0aW9uIDxodHRwOi8vZG9qb2ZvdW5kYXRpb24ub3JnLz5cbiAqIEJhc2VkIG9uIFVuZGVyc2NvcmUuanMgMS41LjIgPGh0dHA6Ly91bmRlcnNjb3JlanMub3JnL0xJQ0VOU0U+XG4gKiBDb3B5cmlnaHQgMjAwOS0yMDEzIEplcmVteSBBc2hrZW5hcywgRG9jdW1lbnRDbG91ZCBhbmQgSW52ZXN0aWdhdGl2ZSBSZXBvcnRlcnMgJiBFZGl0b3JzXG4gKiBBdmFpbGFibGUgdW5kZXIgTUlUIGxpY2Vuc2UgPGh0dHA6Ly9sb2Rhc2guY29tL2xpY2Vuc2U+XG4gKi9cbnZhciBjcmVhdGVXcmFwcGVyID0gcmVxdWlyZSgnLi4vaW50ZXJuYWxzL2NyZWF0ZVdyYXBwZXInKSxcbiAgICBzbGljZSA9IHJlcXVpcmUoJy4uL2ludGVybmFscy9zbGljZScpO1xuXG4vKipcbiAqIENyZWF0ZXMgYSBmdW5jdGlvbiB0aGF0LCB3aGVuIGNhbGxlZCwgaW52b2tlcyBgZnVuY2Agd2l0aCB0aGUgYHRoaXNgXG4gKiBiaW5kaW5nIG9mIGB0aGlzQXJnYCBhbmQgcHJlcGVuZHMgYW55IGFkZGl0aW9uYWwgYGJpbmRgIGFyZ3VtZW50cyB0byB0aG9zZVxuICogcHJvdmlkZWQgdG8gdGhlIGJvdW5kIGZ1bmN0aW9uLlxuICpcbiAqIEBzdGF0aWNcbiAqIEBtZW1iZXJPZiBfXG4gKiBAY2F0ZWdvcnkgRnVuY3Rpb25zXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBmdW5jIFRoZSBmdW5jdGlvbiB0byBiaW5kLlxuICogQHBhcmFtIHsqfSBbdGhpc0FyZ10gVGhlIGB0aGlzYCBiaW5kaW5nIG9mIGBmdW5jYC5cbiAqIEBwYXJhbSB7Li4uKn0gW2FyZ10gQXJndW1lbnRzIHRvIGJlIHBhcnRpYWxseSBhcHBsaWVkLlxuICogQHJldHVybnMge0Z1bmN0aW9ufSBSZXR1cm5zIHRoZSBuZXcgYm91bmQgZnVuY3Rpb24uXG4gKiBAZXhhbXBsZVxuICpcbiAqIHZhciBmdW5jID0gZnVuY3Rpb24oZ3JlZXRpbmcpIHtcbiAqICAgcmV0dXJuIGdyZWV0aW5nICsgJyAnICsgdGhpcy5uYW1lO1xuICogfTtcbiAqXG4gKiBmdW5jID0gXy5iaW5kKGZ1bmMsIHsgJ25hbWUnOiAnZnJlZCcgfSwgJ2hpJyk7XG4gKiBmdW5jKCk7XG4gKiAvLyA9PiAnaGkgZnJlZCdcbiAqL1xuZnVuY3Rpb24gYmluZChmdW5jLCB0aGlzQXJnKSB7XG4gIHJldHVybiBhcmd1bWVudHMubGVuZ3RoID4gMlxuICAgID8gY3JlYXRlV3JhcHBlcihmdW5jLCAxNywgc2xpY2UoYXJndW1lbnRzLCAyKSwgbnVsbCwgdGhpc0FyZylcbiAgICA6IGNyZWF0ZVdyYXBwZXIoZnVuYywgMSwgbnVsbCwgbnVsbCwgdGhpc0FyZyk7XG59XG5cbm1vZHVsZS5leHBvcnRzID0gYmluZDtcbiIsIi8qKlxuICogTG8tRGFzaCAyLjQuMSAoQ3VzdG9tIEJ1aWxkKSA8aHR0cDovL2xvZGFzaC5jb20vPlxuICogQnVpbGQ6IGBsb2Rhc2ggbW9kdWxhcml6ZSBtb2Rlcm4gZXhwb3J0cz1cIm5vZGVcIiAtbyAuL21vZGVybi9gXG4gKiBDb3B5cmlnaHQgMjAxMi0yMDEzIFRoZSBEb2pvIEZvdW5kYXRpb24gPGh0dHA6Ly9kb2pvZm91bmRhdGlvbi5vcmcvPlxuICogQmFzZWQgb24gVW5kZXJzY29yZS5qcyAxLjUuMiA8aHR0cDovL3VuZGVyc2NvcmVqcy5vcmcvTElDRU5TRT5cbiAqIENvcHlyaWdodCAyMDA5LTIwMTMgSmVyZW15IEFzaGtlbmFzLCBEb2N1bWVudENsb3VkIGFuZCBJbnZlc3RpZ2F0aXZlIFJlcG9ydGVycyAmIEVkaXRvcnNcbiAqIEF2YWlsYWJsZSB1bmRlciBNSVQgbGljZW5zZSA8aHR0cDovL2xvZGFzaC5jb20vbGljZW5zZT5cbiAqL1xudmFyIGJhc2VGbGF0dGVuID0gcmVxdWlyZSgnLi4vaW50ZXJuYWxzL2Jhc2VGbGF0dGVuJyksXG4gICAgY3JlYXRlV3JhcHBlciA9IHJlcXVpcmUoJy4uL2ludGVybmFscy9jcmVhdGVXcmFwcGVyJyksXG4gICAgZnVuY3Rpb25zID0gcmVxdWlyZSgnLi4vb2JqZWN0cy9mdW5jdGlvbnMnKTtcblxuLyoqXG4gKiBCaW5kcyBtZXRob2RzIG9mIGFuIG9iamVjdCB0byB0aGUgb2JqZWN0IGl0c2VsZiwgb3ZlcndyaXRpbmcgdGhlIGV4aXN0aW5nXG4gKiBtZXRob2QuIE1ldGhvZCBuYW1lcyBtYXkgYmUgc3BlY2lmaWVkIGFzIGluZGl2aWR1YWwgYXJndW1lbnRzIG9yIGFzIGFycmF5c1xuICogb2YgbWV0aG9kIG5hbWVzLiBJZiBubyBtZXRob2QgbmFtZXMgYXJlIHByb3ZpZGVkIGFsbCB0aGUgZnVuY3Rpb24gcHJvcGVydGllc1xuICogb2YgYG9iamVjdGAgd2lsbCBiZSBib3VuZC5cbiAqXG4gKiBAc3RhdGljXG4gKiBAbWVtYmVyT2YgX1xuICogQGNhdGVnb3J5IEZ1bmN0aW9uc1xuICogQHBhcmFtIHtPYmplY3R9IG9iamVjdCBUaGUgb2JqZWN0IHRvIGJpbmQgYW5kIGFzc2lnbiB0aGUgYm91bmQgbWV0aG9kcyB0by5cbiAqIEBwYXJhbSB7Li4uc3RyaW5nfSBbbWV0aG9kTmFtZV0gVGhlIG9iamVjdCBtZXRob2QgbmFtZXMgdG9cbiAqICBiaW5kLCBzcGVjaWZpZWQgYXMgaW5kaXZpZHVhbCBtZXRob2QgbmFtZXMgb3IgYXJyYXlzIG9mIG1ldGhvZCBuYW1lcy5cbiAqIEByZXR1cm5zIHtPYmplY3R9IFJldHVybnMgYG9iamVjdGAuXG4gKiBAZXhhbXBsZVxuICpcbiAqIHZhciB2aWV3ID0ge1xuICogICAnbGFiZWwnOiAnZG9jcycsXG4gKiAgICdvbkNsaWNrJzogZnVuY3Rpb24oKSB7IGNvbnNvbGUubG9nKCdjbGlja2VkICcgKyB0aGlzLmxhYmVsKTsgfVxuICogfTtcbiAqXG4gKiBfLmJpbmRBbGwodmlldyk7XG4gKiBqUXVlcnkoJyNkb2NzJykub24oJ2NsaWNrJywgdmlldy5vbkNsaWNrKTtcbiAqIC8vID0+IGxvZ3MgJ2NsaWNrZWQgZG9jcycsIHdoZW4gdGhlIGJ1dHRvbiBpcyBjbGlja2VkXG4gKi9cbmZ1bmN0aW9uIGJpbmRBbGwob2JqZWN0KSB7XG4gIHZhciBmdW5jcyA9IGFyZ3VtZW50cy5sZW5ndGggPiAxID8gYmFzZUZsYXR0ZW4oYXJndW1lbnRzLCB0cnVlLCBmYWxzZSwgMSkgOiBmdW5jdGlvbnMob2JqZWN0KSxcbiAgICAgIGluZGV4ID0gLTEsXG4gICAgICBsZW5ndGggPSBmdW5jcy5sZW5ndGg7XG5cbiAgd2hpbGUgKCsraW5kZXggPCBsZW5ndGgpIHtcbiAgICB2YXIga2V5ID0gZnVuY3NbaW5kZXhdO1xuICAgIG9iamVjdFtrZXldID0gY3JlYXRlV3JhcHBlcihvYmplY3Rba2V5XSwgMSwgbnVsbCwgbnVsbCwgb2JqZWN0KTtcbiAgfVxuICByZXR1cm4gb2JqZWN0O1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IGJpbmRBbGw7XG4iLCIvKipcbiAqIExvLURhc2ggMi40LjEgKEN1c3RvbSBCdWlsZCkgPGh0dHA6Ly9sb2Rhc2guY29tLz5cbiAqIEJ1aWxkOiBgbG9kYXNoIG1vZHVsYXJpemUgbW9kZXJuIGV4cG9ydHM9XCJub2RlXCIgLW8gLi9tb2Rlcm4vYFxuICogQ29weXJpZ2h0IDIwMTItMjAxMyBUaGUgRG9qbyBGb3VuZGF0aW9uIDxodHRwOi8vZG9qb2ZvdW5kYXRpb24ub3JnLz5cbiAqIEJhc2VkIG9uIFVuZGVyc2NvcmUuanMgMS41LjIgPGh0dHA6Ly91bmRlcnNjb3JlanMub3JnL0xJQ0VOU0U+XG4gKiBDb3B5cmlnaHQgMjAwOS0yMDEzIEplcmVteSBBc2hrZW5hcywgRG9jdW1lbnRDbG91ZCBhbmQgSW52ZXN0aWdhdGl2ZSBSZXBvcnRlcnMgJiBFZGl0b3JzXG4gKiBBdmFpbGFibGUgdW5kZXIgTUlUIGxpY2Vuc2UgPGh0dHA6Ly9sb2Rhc2guY29tL2xpY2Vuc2U+XG4gKi9cbnZhciBiYXNlQ3JlYXRlQ2FsbGJhY2sgPSByZXF1aXJlKCcuLi9pbnRlcm5hbHMvYmFzZUNyZWF0ZUNhbGxiYWNrJyksXG4gICAgYmFzZUlzRXF1YWwgPSByZXF1aXJlKCcuLi9pbnRlcm5hbHMvYmFzZUlzRXF1YWwnKSxcbiAgICBpc09iamVjdCA9IHJlcXVpcmUoJy4uL29iamVjdHMvaXNPYmplY3QnKSxcbiAgICBrZXlzID0gcmVxdWlyZSgnLi4vb2JqZWN0cy9rZXlzJyksXG4gICAgcHJvcGVydHkgPSByZXF1aXJlKCcuLi91dGlsaXRpZXMvcHJvcGVydHknKTtcblxuLyoqXG4gKiBQcm9kdWNlcyBhIGNhbGxiYWNrIGJvdW5kIHRvIGFuIG9wdGlvbmFsIGB0aGlzQXJnYC4gSWYgYGZ1bmNgIGlzIGEgcHJvcGVydHlcbiAqIG5hbWUgdGhlIGNyZWF0ZWQgY2FsbGJhY2sgd2lsbCByZXR1cm4gdGhlIHByb3BlcnR5IHZhbHVlIGZvciBhIGdpdmVuIGVsZW1lbnQuXG4gKiBJZiBgZnVuY2AgaXMgYW4gb2JqZWN0IHRoZSBjcmVhdGVkIGNhbGxiYWNrIHdpbGwgcmV0dXJuIGB0cnVlYCBmb3IgZWxlbWVudHNcbiAqIHRoYXQgY29udGFpbiB0aGUgZXF1aXZhbGVudCBvYmplY3QgcHJvcGVydGllcywgb3RoZXJ3aXNlIGl0IHdpbGwgcmV0dXJuIGBmYWxzZWAuXG4gKlxuICogQHN0YXRpY1xuICogQG1lbWJlck9mIF9cbiAqIEBjYXRlZ29yeSBVdGlsaXRpZXNcbiAqIEBwYXJhbSB7Kn0gW2Z1bmM9aWRlbnRpdHldIFRoZSB2YWx1ZSB0byBjb252ZXJ0IHRvIGEgY2FsbGJhY2suXG4gKiBAcGFyYW0geyp9IFt0aGlzQXJnXSBUaGUgYHRoaXNgIGJpbmRpbmcgb2YgdGhlIGNyZWF0ZWQgY2FsbGJhY2suXG4gKiBAcGFyYW0ge251bWJlcn0gW2FyZ0NvdW50XSBUaGUgbnVtYmVyIG9mIGFyZ3VtZW50cyB0aGUgY2FsbGJhY2sgYWNjZXB0cy5cbiAqIEByZXR1cm5zIHtGdW5jdGlvbn0gUmV0dXJucyBhIGNhbGxiYWNrIGZ1bmN0aW9uLlxuICogQGV4YW1wbGVcbiAqXG4gKiB2YXIgY2hhcmFjdGVycyA9IFtcbiAqICAgeyAnbmFtZSc6ICdiYXJuZXknLCAnYWdlJzogMzYgfSxcbiAqICAgeyAnbmFtZSc6ICdmcmVkJywgICAnYWdlJzogNDAgfVxuICogXTtcbiAqXG4gKiAvLyB3cmFwIHRvIGNyZWF0ZSBjdXN0b20gY2FsbGJhY2sgc2hvcnRoYW5kc1xuICogXy5jcmVhdGVDYWxsYmFjayA9IF8ud3JhcChfLmNyZWF0ZUNhbGxiYWNrLCBmdW5jdGlvbihmdW5jLCBjYWxsYmFjaywgdGhpc0FyZykge1xuICogICB2YXIgbWF0Y2ggPSAvXiguKz8pX18oW2dsXXQpKC4rKSQvLmV4ZWMoY2FsbGJhY2spO1xuICogICByZXR1cm4gIW1hdGNoID8gZnVuYyhjYWxsYmFjaywgdGhpc0FyZykgOiBmdW5jdGlvbihvYmplY3QpIHtcbiAqICAgICByZXR1cm4gbWF0Y2hbMl0gPT0gJ2d0JyA/IG9iamVjdFttYXRjaFsxXV0gPiBtYXRjaFszXSA6IG9iamVjdFttYXRjaFsxXV0gPCBtYXRjaFszXTtcbiAqICAgfTtcbiAqIH0pO1xuICpcbiAqIF8uZmlsdGVyKGNoYXJhY3RlcnMsICdhZ2VfX2d0MzgnKTtcbiAqIC8vID0+IFt7ICduYW1lJzogJ2ZyZWQnLCAnYWdlJzogNDAgfV1cbiAqL1xuZnVuY3Rpb24gY3JlYXRlQ2FsbGJhY2soZnVuYywgdGhpc0FyZywgYXJnQ291bnQpIHtcbiAgdmFyIHR5cGUgPSB0eXBlb2YgZnVuYztcbiAgaWYgKGZ1bmMgPT0gbnVsbCB8fCB0eXBlID09ICdmdW5jdGlvbicpIHtcbiAgICByZXR1cm4gYmFzZUNyZWF0ZUNhbGxiYWNrKGZ1bmMsIHRoaXNBcmcsIGFyZ0NvdW50KTtcbiAgfVxuICAvLyBoYW5kbGUgXCJfLnBsdWNrXCIgc3R5bGUgY2FsbGJhY2sgc2hvcnRoYW5kc1xuICBpZiAodHlwZSAhPSAnb2JqZWN0Jykge1xuICAgIHJldHVybiBwcm9wZXJ0eShmdW5jKTtcbiAgfVxuICB2YXIgcHJvcHMgPSBrZXlzKGZ1bmMpLFxuICAgICAga2V5ID0gcHJvcHNbMF0sXG4gICAgICBhID0gZnVuY1trZXldO1xuXG4gIC8vIGhhbmRsZSBcIl8ud2hlcmVcIiBzdHlsZSBjYWxsYmFjayBzaG9ydGhhbmRzXG4gIGlmIChwcm9wcy5sZW5ndGggPT0gMSAmJiBhID09PSBhICYmICFpc09iamVjdChhKSkge1xuICAgIC8vIGZhc3QgcGF0aCB0aGUgY29tbW9uIGNhc2Ugb2YgcHJvdmlkaW5nIGFuIG9iamVjdCB3aXRoIGEgc2luZ2xlXG4gICAgLy8gcHJvcGVydHkgY29udGFpbmluZyBhIHByaW1pdGl2ZSB2YWx1ZVxuICAgIHJldHVybiBmdW5jdGlvbihvYmplY3QpIHtcbiAgICAgIHZhciBiID0gb2JqZWN0W2tleV07XG4gICAgICByZXR1cm4gYSA9PT0gYiAmJiAoYSAhPT0gMCB8fCAoMSAvIGEgPT0gMSAvIGIpKTtcbiAgICB9O1xuICB9XG4gIHJldHVybiBmdW5jdGlvbihvYmplY3QpIHtcbiAgICB2YXIgbGVuZ3RoID0gcHJvcHMubGVuZ3RoLFxuICAgICAgICByZXN1bHQgPSBmYWxzZTtcblxuICAgIHdoaWxlIChsZW5ndGgtLSkge1xuICAgICAgaWYgKCEocmVzdWx0ID0gYmFzZUlzRXF1YWwob2JqZWN0W3Byb3BzW2xlbmd0aF1dLCBmdW5jW3Byb3BzW2xlbmd0aF1dLCBudWxsLCB0cnVlKSkpIHtcbiAgICAgICAgYnJlYWs7XG4gICAgICB9XG4gICAgfVxuICAgIHJldHVybiByZXN1bHQ7XG4gIH07XG59XG5cbm1vZHVsZS5leHBvcnRzID0gY3JlYXRlQ2FsbGJhY2s7XG4iLCIvKipcbiAqIExvLURhc2ggMi40LjEgKEN1c3RvbSBCdWlsZCkgPGh0dHA6Ly9sb2Rhc2guY29tLz5cbiAqIEJ1aWxkOiBgbG9kYXNoIG1vZHVsYXJpemUgbW9kZXJuIGV4cG9ydHM9XCJub2RlXCIgLW8gLi9tb2Rlcm4vYFxuICogQ29weXJpZ2h0IDIwMTItMjAxMyBUaGUgRG9qbyBGb3VuZGF0aW9uIDxodHRwOi8vZG9qb2ZvdW5kYXRpb24ub3JnLz5cbiAqIEJhc2VkIG9uIFVuZGVyc2NvcmUuanMgMS41LjIgPGh0dHA6Ly91bmRlcnNjb3JlanMub3JnL0xJQ0VOU0U+XG4gKiBDb3B5cmlnaHQgMjAwOS0yMDEzIEplcmVteSBBc2hrZW5hcywgRG9jdW1lbnRDbG91ZCBhbmQgSW52ZXN0aWdhdGl2ZSBSZXBvcnRlcnMgJiBFZGl0b3JzXG4gKiBBdmFpbGFibGUgdW5kZXIgTUlUIGxpY2Vuc2UgPGh0dHA6Ly9sb2Rhc2guY29tL2xpY2Vuc2U+XG4gKi9cbnZhciBjcmVhdGVXcmFwcGVyID0gcmVxdWlyZSgnLi4vaW50ZXJuYWxzL2NyZWF0ZVdyYXBwZXInKTtcblxuLyoqXG4gKiBDcmVhdGVzIGEgZnVuY3Rpb24gdGhhdCBwcm92aWRlcyBgdmFsdWVgIHRvIHRoZSB3cmFwcGVyIGZ1bmN0aW9uIGFzIGl0c1xuICogZmlyc3QgYXJndW1lbnQuIEFkZGl0aW9uYWwgYXJndW1lbnRzIHByb3ZpZGVkIHRvIHRoZSBmdW5jdGlvbiBhcmUgYXBwZW5kZWRcbiAqIHRvIHRob3NlIHByb3ZpZGVkIHRvIHRoZSB3cmFwcGVyIGZ1bmN0aW9uLiBUaGUgd3JhcHBlciBpcyBleGVjdXRlZCB3aXRoXG4gKiB0aGUgYHRoaXNgIGJpbmRpbmcgb2YgdGhlIGNyZWF0ZWQgZnVuY3Rpb24uXG4gKlxuICogQHN0YXRpY1xuICogQG1lbWJlck9mIF9cbiAqIEBjYXRlZ29yeSBGdW5jdGlvbnNcbiAqIEBwYXJhbSB7Kn0gdmFsdWUgVGhlIHZhbHVlIHRvIHdyYXAuXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSB3cmFwcGVyIFRoZSB3cmFwcGVyIGZ1bmN0aW9uLlxuICogQHJldHVybnMge0Z1bmN0aW9ufSBSZXR1cm5zIHRoZSBuZXcgZnVuY3Rpb24uXG4gKiBAZXhhbXBsZVxuICpcbiAqIHZhciBwID0gXy53cmFwKF8uZXNjYXBlLCBmdW5jdGlvbihmdW5jLCB0ZXh0KSB7XG4gKiAgIHJldHVybiAnPHA+JyArIGZ1bmModGV4dCkgKyAnPC9wPic7XG4gKiB9KTtcbiAqXG4gKiBwKCdGcmVkLCBXaWxtYSwgJiBQZWJibGVzJyk7XG4gKiAvLyA9PiAnPHA+RnJlZCwgV2lsbWEsICZhbXA7IFBlYmJsZXM8L3A+J1xuICovXG5mdW5jdGlvbiB3cmFwKHZhbHVlLCB3cmFwcGVyKSB7XG4gIHJldHVybiBjcmVhdGVXcmFwcGVyKHdyYXBwZXIsIDE2LCBbdmFsdWVdKTtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSB3cmFwO1xuIiwiLyoqXG4gKiBMby1EYXNoIDIuNC4xIChDdXN0b20gQnVpbGQpIDxodHRwOi8vbG9kYXNoLmNvbS8+XG4gKiBCdWlsZDogYGxvZGFzaCBtb2R1bGFyaXplIG1vZGVybiBleHBvcnRzPVwibm9kZVwiIC1vIC4vbW9kZXJuL2BcbiAqIENvcHlyaWdodCAyMDEyLTIwMTMgVGhlIERvam8gRm91bmRhdGlvbiA8aHR0cDovL2Rvam9mb3VuZGF0aW9uLm9yZy8+XG4gKiBCYXNlZCBvbiBVbmRlcnNjb3JlLmpzIDEuNS4yIDxodHRwOi8vdW5kZXJzY29yZWpzLm9yZy9MSUNFTlNFPlxuICogQ29weXJpZ2h0IDIwMDktMjAxMyBKZXJlbXkgQXNoa2VuYXMsIERvY3VtZW50Q2xvdWQgYW5kIEludmVzdGlnYXRpdmUgUmVwb3J0ZXJzICYgRWRpdG9yc1xuICogQXZhaWxhYmxlIHVuZGVyIE1JVCBsaWNlbnNlIDxodHRwOi8vbG9kYXNoLmNvbS9saWNlbnNlPlxuICovXG5cbi8qKiBVc2VkIHRvIHBvb2wgYXJyYXlzIGFuZCBvYmplY3RzIHVzZWQgaW50ZXJuYWxseSAqL1xudmFyIGFycmF5UG9vbCA9IFtdO1xuXG5tb2R1bGUuZXhwb3J0cyA9IGFycmF5UG9vbDtcbiIsIi8qKlxuICogTG8tRGFzaCAyLjQuMSAoQ3VzdG9tIEJ1aWxkKSA8aHR0cDovL2xvZGFzaC5jb20vPlxuICogQnVpbGQ6IGBsb2Rhc2ggbW9kdWxhcml6ZSBtb2Rlcm4gZXhwb3J0cz1cIm5vZGVcIiAtbyAuL21vZGVybi9gXG4gKiBDb3B5cmlnaHQgMjAxMi0yMDEzIFRoZSBEb2pvIEZvdW5kYXRpb24gPGh0dHA6Ly9kb2pvZm91bmRhdGlvbi5vcmcvPlxuICogQmFzZWQgb24gVW5kZXJzY29yZS5qcyAxLjUuMiA8aHR0cDovL3VuZGVyc2NvcmVqcy5vcmcvTElDRU5TRT5cbiAqIENvcHlyaWdodCAyMDA5LTIwMTMgSmVyZW15IEFzaGtlbmFzLCBEb2N1bWVudENsb3VkIGFuZCBJbnZlc3RpZ2F0aXZlIFJlcG9ydGVycyAmIEVkaXRvcnNcbiAqIEF2YWlsYWJsZSB1bmRlciBNSVQgbGljZW5zZSA8aHR0cDovL2xvZGFzaC5jb20vbGljZW5zZT5cbiAqL1xudmFyIGJhc2VDcmVhdGUgPSByZXF1aXJlKCcuL2Jhc2VDcmVhdGUnKSxcbiAgICBpc09iamVjdCA9IHJlcXVpcmUoJy4uL29iamVjdHMvaXNPYmplY3QnKSxcbiAgICBzZXRCaW5kRGF0YSA9IHJlcXVpcmUoJy4vc2V0QmluZERhdGEnKSxcbiAgICBzbGljZSA9IHJlcXVpcmUoJy4vc2xpY2UnKTtcblxuLyoqXG4gKiBVc2VkIGZvciBgQXJyYXlgIG1ldGhvZCByZWZlcmVuY2VzLlxuICpcbiAqIE5vcm1hbGx5IGBBcnJheS5wcm90b3R5cGVgIHdvdWxkIHN1ZmZpY2UsIGhvd2V2ZXIsIHVzaW5nIGFuIGFycmF5IGxpdGVyYWxcbiAqIGF2b2lkcyBpc3N1ZXMgaW4gTmFyd2hhbC5cbiAqL1xudmFyIGFycmF5UmVmID0gW107XG5cbi8qKiBOYXRpdmUgbWV0aG9kIHNob3J0Y3V0cyAqL1xudmFyIHB1c2ggPSBhcnJheVJlZi5wdXNoO1xuXG4vKipcbiAqIFRoZSBiYXNlIGltcGxlbWVudGF0aW9uIG9mIGBfLmJpbmRgIHRoYXQgY3JlYXRlcyB0aGUgYm91bmQgZnVuY3Rpb24gYW5kXG4gKiBzZXRzIGl0cyBtZXRhIGRhdGEuXG4gKlxuICogQHByaXZhdGVcbiAqIEBwYXJhbSB7QXJyYXl9IGJpbmREYXRhIFRoZSBiaW5kIGRhdGEgYXJyYXkuXG4gKiBAcmV0dXJucyB7RnVuY3Rpb259IFJldHVybnMgdGhlIG5ldyBib3VuZCBmdW5jdGlvbi5cbiAqL1xuZnVuY3Rpb24gYmFzZUJpbmQoYmluZERhdGEpIHtcbiAgdmFyIGZ1bmMgPSBiaW5kRGF0YVswXSxcbiAgICAgIHBhcnRpYWxBcmdzID0gYmluZERhdGFbMl0sXG4gICAgICB0aGlzQXJnID0gYmluZERhdGFbNF07XG5cbiAgZnVuY3Rpb24gYm91bmQoKSB7XG4gICAgLy8gYEZ1bmN0aW9uI2JpbmRgIHNwZWNcbiAgICAvLyBodHRwOi8vZXM1LmdpdGh1Yi5pby8jeDE1LjMuNC41XG4gICAgaWYgKHBhcnRpYWxBcmdzKSB7XG4gICAgICAvLyBhdm9pZCBgYXJndW1lbnRzYCBvYmplY3QgZGVvcHRpbWl6YXRpb25zIGJ5IHVzaW5nIGBzbGljZWAgaW5zdGVhZFxuICAgICAgLy8gb2YgYEFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsYCBhbmQgbm90IGFzc2lnbmluZyBgYXJndW1lbnRzYCB0byBhXG4gICAgICAvLyB2YXJpYWJsZSBhcyBhIHRlcm5hcnkgZXhwcmVzc2lvblxuICAgICAgdmFyIGFyZ3MgPSBzbGljZShwYXJ0aWFsQXJncyk7XG4gICAgICBwdXNoLmFwcGx5KGFyZ3MsIGFyZ3VtZW50cyk7XG4gICAgfVxuICAgIC8vIG1pbWljIHRoZSBjb25zdHJ1Y3RvcidzIGByZXR1cm5gIGJlaGF2aW9yXG4gICAgLy8gaHR0cDovL2VzNS5naXRodWIuaW8vI3gxMy4yLjJcbiAgICBpZiAodGhpcyBpbnN0YW5jZW9mIGJvdW5kKSB7XG4gICAgICAvLyBlbnN1cmUgYG5ldyBib3VuZGAgaXMgYW4gaW5zdGFuY2Ugb2YgYGZ1bmNgXG4gICAgICB2YXIgdGhpc0JpbmRpbmcgPSBiYXNlQ3JlYXRlKGZ1bmMucHJvdG90eXBlKSxcbiAgICAgICAgICByZXN1bHQgPSBmdW5jLmFwcGx5KHRoaXNCaW5kaW5nLCBhcmdzIHx8IGFyZ3VtZW50cyk7XG4gICAgICByZXR1cm4gaXNPYmplY3QocmVzdWx0KSA/IHJlc3VsdCA6IHRoaXNCaW5kaW5nO1xuICAgIH1cbiAgICByZXR1cm4gZnVuYy5hcHBseSh0aGlzQXJnLCBhcmdzIHx8IGFyZ3VtZW50cyk7XG4gIH1cbiAgc2V0QmluZERhdGEoYm91bmQsIGJpbmREYXRhKTtcbiAgcmV0dXJuIGJvdW5kO1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IGJhc2VCaW5kO1xuIiwiKGZ1bmN0aW9uIChnbG9iYWwpe1xuLyoqXG4gKiBMby1EYXNoIDIuNC4xIChDdXN0b20gQnVpbGQpIDxodHRwOi8vbG9kYXNoLmNvbS8+XG4gKiBCdWlsZDogYGxvZGFzaCBtb2R1bGFyaXplIG1vZGVybiBleHBvcnRzPVwibm9kZVwiIC1vIC4vbW9kZXJuL2BcbiAqIENvcHlyaWdodCAyMDEyLTIwMTMgVGhlIERvam8gRm91bmRhdGlvbiA8aHR0cDovL2Rvam9mb3VuZGF0aW9uLm9yZy8+XG4gKiBCYXNlZCBvbiBVbmRlcnNjb3JlLmpzIDEuNS4yIDxodHRwOi8vdW5kZXJzY29yZWpzLm9yZy9MSUNFTlNFPlxuICogQ29weXJpZ2h0IDIwMDktMjAxMyBKZXJlbXkgQXNoa2VuYXMsIERvY3VtZW50Q2xvdWQgYW5kIEludmVzdGlnYXRpdmUgUmVwb3J0ZXJzICYgRWRpdG9yc1xuICogQXZhaWxhYmxlIHVuZGVyIE1JVCBsaWNlbnNlIDxodHRwOi8vbG9kYXNoLmNvbS9saWNlbnNlPlxuICovXG52YXIgaXNOYXRpdmUgPSByZXF1aXJlKCcuL2lzTmF0aXZlJyksXG4gICAgaXNPYmplY3QgPSByZXF1aXJlKCcuLi9vYmplY3RzL2lzT2JqZWN0JyksXG4gICAgbm9vcCA9IHJlcXVpcmUoJy4uL3V0aWxpdGllcy9ub29wJyk7XG5cbi8qIE5hdGl2ZSBtZXRob2Qgc2hvcnRjdXRzIGZvciBtZXRob2RzIHdpdGggdGhlIHNhbWUgbmFtZSBhcyBvdGhlciBgbG9kYXNoYCBtZXRob2RzICovXG52YXIgbmF0aXZlQ3JlYXRlID0gaXNOYXRpdmUobmF0aXZlQ3JlYXRlID0gT2JqZWN0LmNyZWF0ZSkgJiYgbmF0aXZlQ3JlYXRlO1xuXG4vKipcbiAqIFRoZSBiYXNlIGltcGxlbWVudGF0aW9uIG9mIGBfLmNyZWF0ZWAgd2l0aG91dCBzdXBwb3J0IGZvciBhc3NpZ25pbmdcbiAqIHByb3BlcnRpZXMgdG8gdGhlIGNyZWF0ZWQgb2JqZWN0LlxuICpcbiAqIEBwcml2YXRlXG4gKiBAcGFyYW0ge09iamVjdH0gcHJvdG90eXBlIFRoZSBvYmplY3QgdG8gaW5oZXJpdCBmcm9tLlxuICogQHJldHVybnMge09iamVjdH0gUmV0dXJucyB0aGUgbmV3IG9iamVjdC5cbiAqL1xuZnVuY3Rpb24gYmFzZUNyZWF0ZShwcm90b3R5cGUsIHByb3BlcnRpZXMpIHtcbiAgcmV0dXJuIGlzT2JqZWN0KHByb3RvdHlwZSkgPyBuYXRpdmVDcmVhdGUocHJvdG90eXBlKSA6IHt9O1xufVxuLy8gZmFsbGJhY2sgZm9yIGJyb3dzZXJzIHdpdGhvdXQgYE9iamVjdC5jcmVhdGVgXG5pZiAoIW5hdGl2ZUNyZWF0ZSkge1xuICBiYXNlQ3JlYXRlID0gKGZ1bmN0aW9uKCkge1xuICAgIGZ1bmN0aW9uIE9iamVjdCgpIHt9XG4gICAgcmV0dXJuIGZ1bmN0aW9uKHByb3RvdHlwZSkge1xuICAgICAgaWYgKGlzT2JqZWN0KHByb3RvdHlwZSkpIHtcbiAgICAgICAgT2JqZWN0LnByb3RvdHlwZSA9IHByb3RvdHlwZTtcbiAgICAgICAgdmFyIHJlc3VsdCA9IG5ldyBPYmplY3Q7XG4gICAgICAgIE9iamVjdC5wcm90b3R5cGUgPSBudWxsO1xuICAgICAgfVxuICAgICAgcmV0dXJuIHJlc3VsdCB8fCBnbG9iYWwuT2JqZWN0KCk7XG4gICAgfTtcbiAgfSgpKTtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBiYXNlQ3JlYXRlO1xuXG59KS5jYWxsKHRoaXMsdHlwZW9mIHNlbGYgIT09IFwidW5kZWZpbmVkXCIgPyBzZWxmIDogdHlwZW9mIHdpbmRvdyAhPT0gXCJ1bmRlZmluZWRcIiA/IHdpbmRvdyA6IHt9KSIsIi8qKlxuICogTG8tRGFzaCAyLjQuMSAoQ3VzdG9tIEJ1aWxkKSA8aHR0cDovL2xvZGFzaC5jb20vPlxuICogQnVpbGQ6IGBsb2Rhc2ggbW9kdWxhcml6ZSBtb2Rlcm4gZXhwb3J0cz1cIm5vZGVcIiAtbyAuL21vZGVybi9gXG4gKiBDb3B5cmlnaHQgMjAxMi0yMDEzIFRoZSBEb2pvIEZvdW5kYXRpb24gPGh0dHA6Ly9kb2pvZm91bmRhdGlvbi5vcmcvPlxuICogQmFzZWQgb24gVW5kZXJzY29yZS5qcyAxLjUuMiA8aHR0cDovL3VuZGVyc2NvcmVqcy5vcmcvTElDRU5TRT5cbiAqIENvcHlyaWdodCAyMDA5LTIwMTMgSmVyZW15IEFzaGtlbmFzLCBEb2N1bWVudENsb3VkIGFuZCBJbnZlc3RpZ2F0aXZlIFJlcG9ydGVycyAmIEVkaXRvcnNcbiAqIEF2YWlsYWJsZSB1bmRlciBNSVQgbGljZW5zZSA8aHR0cDovL2xvZGFzaC5jb20vbGljZW5zZT5cbiAqL1xudmFyIGJpbmQgPSByZXF1aXJlKCcuLi9mdW5jdGlvbnMvYmluZCcpLFxuICAgIGlkZW50aXR5ID0gcmVxdWlyZSgnLi4vdXRpbGl0aWVzL2lkZW50aXR5JyksXG4gICAgc2V0QmluZERhdGEgPSByZXF1aXJlKCcuL3NldEJpbmREYXRhJyksXG4gICAgc3VwcG9ydCA9IHJlcXVpcmUoJy4uL3N1cHBvcnQnKTtcblxuLyoqIFVzZWQgdG8gZGV0ZWN0ZWQgbmFtZWQgZnVuY3Rpb25zICovXG52YXIgcmVGdW5jTmFtZSA9IC9eXFxzKmZ1bmN0aW9uWyBcXG5cXHJcXHRdK1xcdy87XG5cbi8qKiBVc2VkIHRvIGRldGVjdCBmdW5jdGlvbnMgY29udGFpbmluZyBhIGB0aGlzYCByZWZlcmVuY2UgKi9cbnZhciByZVRoaXMgPSAvXFxidGhpc1xcYi87XG5cbi8qKiBOYXRpdmUgbWV0aG9kIHNob3J0Y3V0cyAqL1xudmFyIGZuVG9TdHJpbmcgPSBGdW5jdGlvbi5wcm90b3R5cGUudG9TdHJpbmc7XG5cbi8qKlxuICogVGhlIGJhc2UgaW1wbGVtZW50YXRpb24gb2YgYF8uY3JlYXRlQ2FsbGJhY2tgIHdpdGhvdXQgc3VwcG9ydCBmb3IgY3JlYXRpbmdcbiAqIFwiXy5wbHVja1wiIG9yIFwiXy53aGVyZVwiIHN0eWxlIGNhbGxiYWNrcy5cbiAqXG4gKiBAcHJpdmF0ZVxuICogQHBhcmFtIHsqfSBbZnVuYz1pZGVudGl0eV0gVGhlIHZhbHVlIHRvIGNvbnZlcnQgdG8gYSBjYWxsYmFjay5cbiAqIEBwYXJhbSB7Kn0gW3RoaXNBcmddIFRoZSBgdGhpc2AgYmluZGluZyBvZiB0aGUgY3JlYXRlZCBjYWxsYmFjay5cbiAqIEBwYXJhbSB7bnVtYmVyfSBbYXJnQ291bnRdIFRoZSBudW1iZXIgb2YgYXJndW1lbnRzIHRoZSBjYWxsYmFjayBhY2NlcHRzLlxuICogQHJldHVybnMge0Z1bmN0aW9ufSBSZXR1cm5zIGEgY2FsbGJhY2sgZnVuY3Rpb24uXG4gKi9cbmZ1bmN0aW9uIGJhc2VDcmVhdGVDYWxsYmFjayhmdW5jLCB0aGlzQXJnLCBhcmdDb3VudCkge1xuICBpZiAodHlwZW9mIGZ1bmMgIT0gJ2Z1bmN0aW9uJykge1xuICAgIHJldHVybiBpZGVudGl0eTtcbiAgfVxuICAvLyBleGl0IGVhcmx5IGZvciBubyBgdGhpc0FyZ2Agb3IgYWxyZWFkeSBib3VuZCBieSBgRnVuY3Rpb24jYmluZGBcbiAgaWYgKHR5cGVvZiB0aGlzQXJnID09ICd1bmRlZmluZWQnIHx8ICEoJ3Byb3RvdHlwZScgaW4gZnVuYykpIHtcbiAgICByZXR1cm4gZnVuYztcbiAgfVxuICB2YXIgYmluZERhdGEgPSBmdW5jLl9fYmluZERhdGFfXztcbiAgaWYgKHR5cGVvZiBiaW5kRGF0YSA9PSAndW5kZWZpbmVkJykge1xuICAgIGlmIChzdXBwb3J0LmZ1bmNOYW1lcykge1xuICAgICAgYmluZERhdGEgPSAhZnVuYy5uYW1lO1xuICAgIH1cbiAgICBiaW5kRGF0YSA9IGJpbmREYXRhIHx8ICFzdXBwb3J0LmZ1bmNEZWNvbXA7XG4gICAgaWYgKCFiaW5kRGF0YSkge1xuICAgICAgdmFyIHNvdXJjZSA9IGZuVG9TdHJpbmcuY2FsbChmdW5jKTtcbiAgICAgIGlmICghc3VwcG9ydC5mdW5jTmFtZXMpIHtcbiAgICAgICAgYmluZERhdGEgPSAhcmVGdW5jTmFtZS50ZXN0KHNvdXJjZSk7XG4gICAgICB9XG4gICAgICBpZiAoIWJpbmREYXRhKSB7XG4gICAgICAgIC8vIGNoZWNrcyBpZiBgZnVuY2AgcmVmZXJlbmNlcyB0aGUgYHRoaXNgIGtleXdvcmQgYW5kIHN0b3JlcyB0aGUgcmVzdWx0XG4gICAgICAgIGJpbmREYXRhID0gcmVUaGlzLnRlc3Qoc291cmNlKTtcbiAgICAgICAgc2V0QmluZERhdGEoZnVuYywgYmluZERhdGEpO1xuICAgICAgfVxuICAgIH1cbiAgfVxuICAvLyBleGl0IGVhcmx5IGlmIHRoZXJlIGFyZSBubyBgdGhpc2AgcmVmZXJlbmNlcyBvciBgZnVuY2AgaXMgYm91bmRcbiAgaWYgKGJpbmREYXRhID09PSBmYWxzZSB8fCAoYmluZERhdGEgIT09IHRydWUgJiYgYmluZERhdGFbMV0gJiAxKSkge1xuICAgIHJldHVybiBmdW5jO1xuICB9XG4gIHN3aXRjaCAoYXJnQ291bnQpIHtcbiAgICBjYXNlIDE6IHJldHVybiBmdW5jdGlvbih2YWx1ZSkge1xuICAgICAgcmV0dXJuIGZ1bmMuY2FsbCh0aGlzQXJnLCB2YWx1ZSk7XG4gICAgfTtcbiAgICBjYXNlIDI6IHJldHVybiBmdW5jdGlvbihhLCBiKSB7XG4gICAgICByZXR1cm4gZnVuYy5jYWxsKHRoaXNBcmcsIGEsIGIpO1xuICAgIH07XG4gICAgY2FzZSAzOiByZXR1cm4gZnVuY3Rpb24odmFsdWUsIGluZGV4LCBjb2xsZWN0aW9uKSB7XG4gICAgICByZXR1cm4gZnVuYy5jYWxsKHRoaXNBcmcsIHZhbHVlLCBpbmRleCwgY29sbGVjdGlvbik7XG4gICAgfTtcbiAgICBjYXNlIDQ6IHJldHVybiBmdW5jdGlvbihhY2N1bXVsYXRvciwgdmFsdWUsIGluZGV4LCBjb2xsZWN0aW9uKSB7XG4gICAgICByZXR1cm4gZnVuYy5jYWxsKHRoaXNBcmcsIGFjY3VtdWxhdG9yLCB2YWx1ZSwgaW5kZXgsIGNvbGxlY3Rpb24pO1xuICAgIH07XG4gIH1cbiAgcmV0dXJuIGJpbmQoZnVuYywgdGhpc0FyZyk7XG59XG5cbm1vZHVsZS5leHBvcnRzID0gYmFzZUNyZWF0ZUNhbGxiYWNrO1xuIiwiLyoqXG4gKiBMby1EYXNoIDIuNC4xIChDdXN0b20gQnVpbGQpIDxodHRwOi8vbG9kYXNoLmNvbS8+XG4gKiBCdWlsZDogYGxvZGFzaCBtb2R1bGFyaXplIG1vZGVybiBleHBvcnRzPVwibm9kZVwiIC1vIC4vbW9kZXJuL2BcbiAqIENvcHlyaWdodCAyMDEyLTIwMTMgVGhlIERvam8gRm91bmRhdGlvbiA8aHR0cDovL2Rvam9mb3VuZGF0aW9uLm9yZy8+XG4gKiBCYXNlZCBvbiBVbmRlcnNjb3JlLmpzIDEuNS4yIDxodHRwOi8vdW5kZXJzY29yZWpzLm9yZy9MSUNFTlNFPlxuICogQ29weXJpZ2h0IDIwMDktMjAxMyBKZXJlbXkgQXNoa2VuYXMsIERvY3VtZW50Q2xvdWQgYW5kIEludmVzdGlnYXRpdmUgUmVwb3J0ZXJzICYgRWRpdG9yc1xuICogQXZhaWxhYmxlIHVuZGVyIE1JVCBsaWNlbnNlIDxodHRwOi8vbG9kYXNoLmNvbS9saWNlbnNlPlxuICovXG52YXIgYmFzZUNyZWF0ZSA9IHJlcXVpcmUoJy4vYmFzZUNyZWF0ZScpLFxuICAgIGlzT2JqZWN0ID0gcmVxdWlyZSgnLi4vb2JqZWN0cy9pc09iamVjdCcpLFxuICAgIHNldEJpbmREYXRhID0gcmVxdWlyZSgnLi9zZXRCaW5kRGF0YScpLFxuICAgIHNsaWNlID0gcmVxdWlyZSgnLi9zbGljZScpO1xuXG4vKipcbiAqIFVzZWQgZm9yIGBBcnJheWAgbWV0aG9kIHJlZmVyZW5jZXMuXG4gKlxuICogTm9ybWFsbHkgYEFycmF5LnByb3RvdHlwZWAgd291bGQgc3VmZmljZSwgaG93ZXZlciwgdXNpbmcgYW4gYXJyYXkgbGl0ZXJhbFxuICogYXZvaWRzIGlzc3VlcyBpbiBOYXJ3aGFsLlxuICovXG52YXIgYXJyYXlSZWYgPSBbXTtcblxuLyoqIE5hdGl2ZSBtZXRob2Qgc2hvcnRjdXRzICovXG52YXIgcHVzaCA9IGFycmF5UmVmLnB1c2g7XG5cbi8qKlxuICogVGhlIGJhc2UgaW1wbGVtZW50YXRpb24gb2YgYGNyZWF0ZVdyYXBwZXJgIHRoYXQgY3JlYXRlcyB0aGUgd3JhcHBlciBhbmRcbiAqIHNldHMgaXRzIG1ldGEgZGF0YS5cbiAqXG4gKiBAcHJpdmF0ZVxuICogQHBhcmFtIHtBcnJheX0gYmluZERhdGEgVGhlIGJpbmQgZGF0YSBhcnJheS5cbiAqIEByZXR1cm5zIHtGdW5jdGlvbn0gUmV0dXJucyB0aGUgbmV3IGZ1bmN0aW9uLlxuICovXG5mdW5jdGlvbiBiYXNlQ3JlYXRlV3JhcHBlcihiaW5kRGF0YSkge1xuICB2YXIgZnVuYyA9IGJpbmREYXRhWzBdLFxuICAgICAgYml0bWFzayA9IGJpbmREYXRhWzFdLFxuICAgICAgcGFydGlhbEFyZ3MgPSBiaW5kRGF0YVsyXSxcbiAgICAgIHBhcnRpYWxSaWdodEFyZ3MgPSBiaW5kRGF0YVszXSxcbiAgICAgIHRoaXNBcmcgPSBiaW5kRGF0YVs0XSxcbiAgICAgIGFyaXR5ID0gYmluZERhdGFbNV07XG5cbiAgdmFyIGlzQmluZCA9IGJpdG1hc2sgJiAxLFxuICAgICAgaXNCaW5kS2V5ID0gYml0bWFzayAmIDIsXG4gICAgICBpc0N1cnJ5ID0gYml0bWFzayAmIDQsXG4gICAgICBpc0N1cnJ5Qm91bmQgPSBiaXRtYXNrICYgOCxcbiAgICAgIGtleSA9IGZ1bmM7XG5cbiAgZnVuY3Rpb24gYm91bmQoKSB7XG4gICAgdmFyIHRoaXNCaW5kaW5nID0gaXNCaW5kID8gdGhpc0FyZyA6IHRoaXM7XG4gICAgaWYgKHBhcnRpYWxBcmdzKSB7XG4gICAgICB2YXIgYXJncyA9IHNsaWNlKHBhcnRpYWxBcmdzKTtcbiAgICAgIHB1c2guYXBwbHkoYXJncywgYXJndW1lbnRzKTtcbiAgICB9XG4gICAgaWYgKHBhcnRpYWxSaWdodEFyZ3MgfHwgaXNDdXJyeSkge1xuICAgICAgYXJncyB8fCAoYXJncyA9IHNsaWNlKGFyZ3VtZW50cykpO1xuICAgICAgaWYgKHBhcnRpYWxSaWdodEFyZ3MpIHtcbiAgICAgICAgcHVzaC5hcHBseShhcmdzLCBwYXJ0aWFsUmlnaHRBcmdzKTtcbiAgICAgIH1cbiAgICAgIGlmIChpc0N1cnJ5ICYmIGFyZ3MubGVuZ3RoIDwgYXJpdHkpIHtcbiAgICAgICAgYml0bWFzayB8PSAxNiAmIH4zMjtcbiAgICAgICAgcmV0dXJuIGJhc2VDcmVhdGVXcmFwcGVyKFtmdW5jLCAoaXNDdXJyeUJvdW5kID8gYml0bWFzayA6IGJpdG1hc2sgJiB+MyksIGFyZ3MsIG51bGwsIHRoaXNBcmcsIGFyaXR5XSk7XG4gICAgICB9XG4gICAgfVxuICAgIGFyZ3MgfHwgKGFyZ3MgPSBhcmd1bWVudHMpO1xuICAgIGlmIChpc0JpbmRLZXkpIHtcbiAgICAgIGZ1bmMgPSB0aGlzQmluZGluZ1trZXldO1xuICAgIH1cbiAgICBpZiAodGhpcyBpbnN0YW5jZW9mIGJvdW5kKSB7XG4gICAgICB0aGlzQmluZGluZyA9IGJhc2VDcmVhdGUoZnVuYy5wcm90b3R5cGUpO1xuICAgICAgdmFyIHJlc3VsdCA9IGZ1bmMuYXBwbHkodGhpc0JpbmRpbmcsIGFyZ3MpO1xuICAgICAgcmV0dXJuIGlzT2JqZWN0KHJlc3VsdCkgPyByZXN1bHQgOiB0aGlzQmluZGluZztcbiAgICB9XG4gICAgcmV0dXJuIGZ1bmMuYXBwbHkodGhpc0JpbmRpbmcsIGFyZ3MpO1xuICB9XG4gIHNldEJpbmREYXRhKGJvdW5kLCBiaW5kRGF0YSk7XG4gIHJldHVybiBib3VuZDtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBiYXNlQ3JlYXRlV3JhcHBlcjtcbiIsIi8qKlxuICogTG8tRGFzaCAyLjQuMSAoQ3VzdG9tIEJ1aWxkKSA8aHR0cDovL2xvZGFzaC5jb20vPlxuICogQnVpbGQ6IGBsb2Rhc2ggbW9kdWxhcml6ZSBtb2Rlcm4gZXhwb3J0cz1cIm5vZGVcIiAtbyAuL21vZGVybi9gXG4gKiBDb3B5cmlnaHQgMjAxMi0yMDEzIFRoZSBEb2pvIEZvdW5kYXRpb24gPGh0dHA6Ly9kb2pvZm91bmRhdGlvbi5vcmcvPlxuICogQmFzZWQgb24gVW5kZXJzY29yZS5qcyAxLjUuMiA8aHR0cDovL3VuZGVyc2NvcmVqcy5vcmcvTElDRU5TRT5cbiAqIENvcHlyaWdodCAyMDA5LTIwMTMgSmVyZW15IEFzaGtlbmFzLCBEb2N1bWVudENsb3VkIGFuZCBJbnZlc3RpZ2F0aXZlIFJlcG9ydGVycyAmIEVkaXRvcnNcbiAqIEF2YWlsYWJsZSB1bmRlciBNSVQgbGljZW5zZSA8aHR0cDovL2xvZGFzaC5jb20vbGljZW5zZT5cbiAqL1xudmFyIGJhc2VJbmRleE9mID0gcmVxdWlyZSgnLi9iYXNlSW5kZXhPZicpLFxuICAgIGNhY2hlSW5kZXhPZiA9IHJlcXVpcmUoJy4vY2FjaGVJbmRleE9mJyksXG4gICAgY3JlYXRlQ2FjaGUgPSByZXF1aXJlKCcuL2NyZWF0ZUNhY2hlJyksXG4gICAgbGFyZ2VBcnJheVNpemUgPSByZXF1aXJlKCcuL2xhcmdlQXJyYXlTaXplJyksXG4gICAgcmVsZWFzZU9iamVjdCA9IHJlcXVpcmUoJy4vcmVsZWFzZU9iamVjdCcpO1xuXG4vKipcbiAqIFRoZSBiYXNlIGltcGxlbWVudGF0aW9uIG9mIGBfLmRpZmZlcmVuY2VgIHRoYXQgYWNjZXB0cyBhIHNpbmdsZSBhcnJheVxuICogb2YgdmFsdWVzIHRvIGV4Y2x1ZGUuXG4gKlxuICogQHByaXZhdGVcbiAqIEBwYXJhbSB7QXJyYXl9IGFycmF5IFRoZSBhcnJheSB0byBwcm9jZXNzLlxuICogQHBhcmFtIHtBcnJheX0gW3ZhbHVlc10gVGhlIGFycmF5IG9mIHZhbHVlcyB0byBleGNsdWRlLlxuICogQHJldHVybnMge0FycmF5fSBSZXR1cm5zIGEgbmV3IGFycmF5IG9mIGZpbHRlcmVkIHZhbHVlcy5cbiAqL1xuZnVuY3Rpb24gYmFzZURpZmZlcmVuY2UoYXJyYXksIHZhbHVlcykge1xuICB2YXIgaW5kZXggPSAtMSxcbiAgICAgIGluZGV4T2YgPSBiYXNlSW5kZXhPZixcbiAgICAgIGxlbmd0aCA9IGFycmF5ID8gYXJyYXkubGVuZ3RoIDogMCxcbiAgICAgIGlzTGFyZ2UgPSBsZW5ndGggPj0gbGFyZ2VBcnJheVNpemUsXG4gICAgICByZXN1bHQgPSBbXTtcblxuICBpZiAoaXNMYXJnZSkge1xuICAgIHZhciBjYWNoZSA9IGNyZWF0ZUNhY2hlKHZhbHVlcyk7XG4gICAgaWYgKGNhY2hlKSB7XG4gICAgICBpbmRleE9mID0gY2FjaGVJbmRleE9mO1xuICAgICAgdmFsdWVzID0gY2FjaGU7XG4gICAgfSBlbHNlIHtcbiAgICAgIGlzTGFyZ2UgPSBmYWxzZTtcbiAgICB9XG4gIH1cbiAgd2hpbGUgKCsraW5kZXggPCBsZW5ndGgpIHtcbiAgICB2YXIgdmFsdWUgPSBhcnJheVtpbmRleF07XG4gICAgaWYgKGluZGV4T2YodmFsdWVzLCB2YWx1ZSkgPCAwKSB7XG4gICAgICByZXN1bHQucHVzaCh2YWx1ZSk7XG4gICAgfVxuICB9XG4gIGlmIChpc0xhcmdlKSB7XG4gICAgcmVsZWFzZU9iamVjdCh2YWx1ZXMpO1xuICB9XG4gIHJldHVybiByZXN1bHQ7XG59XG5cbm1vZHVsZS5leHBvcnRzID0gYmFzZURpZmZlcmVuY2U7XG4iLCIvKipcbiAqIExvLURhc2ggMi40LjEgKEN1c3RvbSBCdWlsZCkgPGh0dHA6Ly9sb2Rhc2guY29tLz5cbiAqIEJ1aWxkOiBgbG9kYXNoIG1vZHVsYXJpemUgbW9kZXJuIGV4cG9ydHM9XCJub2RlXCIgLW8gLi9tb2Rlcm4vYFxuICogQ29weXJpZ2h0IDIwMTItMjAxMyBUaGUgRG9qbyBGb3VuZGF0aW9uIDxodHRwOi8vZG9qb2ZvdW5kYXRpb24ub3JnLz5cbiAqIEJhc2VkIG9uIFVuZGVyc2NvcmUuanMgMS41LjIgPGh0dHA6Ly91bmRlcnNjb3JlanMub3JnL0xJQ0VOU0U+XG4gKiBDb3B5cmlnaHQgMjAwOS0yMDEzIEplcmVteSBBc2hrZW5hcywgRG9jdW1lbnRDbG91ZCBhbmQgSW52ZXN0aWdhdGl2ZSBSZXBvcnRlcnMgJiBFZGl0b3JzXG4gKiBBdmFpbGFibGUgdW5kZXIgTUlUIGxpY2Vuc2UgPGh0dHA6Ly9sb2Rhc2guY29tL2xpY2Vuc2U+XG4gKi9cbnZhciBpc0FyZ3VtZW50cyA9IHJlcXVpcmUoJy4uL29iamVjdHMvaXNBcmd1bWVudHMnKSxcbiAgICBpc0FycmF5ID0gcmVxdWlyZSgnLi4vb2JqZWN0cy9pc0FycmF5Jyk7XG5cbi8qKlxuICogVGhlIGJhc2UgaW1wbGVtZW50YXRpb24gb2YgYF8uZmxhdHRlbmAgd2l0aG91dCBzdXBwb3J0IGZvciBjYWxsYmFja1xuICogc2hvcnRoYW5kcyBvciBgdGhpc0FyZ2AgYmluZGluZy5cbiAqXG4gKiBAcHJpdmF0ZVxuICogQHBhcmFtIHtBcnJheX0gYXJyYXkgVGhlIGFycmF5IHRvIGZsYXR0ZW4uXG4gKiBAcGFyYW0ge2Jvb2xlYW59IFtpc1NoYWxsb3c9ZmFsc2VdIEEgZmxhZyB0byByZXN0cmljdCBmbGF0dGVuaW5nIHRvIGEgc2luZ2xlIGxldmVsLlxuICogQHBhcmFtIHtib29sZWFufSBbaXNTdHJpY3Q9ZmFsc2VdIEEgZmxhZyB0byByZXN0cmljdCBmbGF0dGVuaW5nIHRvIGFycmF5cyBhbmQgYGFyZ3VtZW50c2Agb2JqZWN0cy5cbiAqIEBwYXJhbSB7bnVtYmVyfSBbZnJvbUluZGV4PTBdIFRoZSBpbmRleCB0byBzdGFydCBmcm9tLlxuICogQHJldHVybnMge0FycmF5fSBSZXR1cm5zIGEgbmV3IGZsYXR0ZW5lZCBhcnJheS5cbiAqL1xuZnVuY3Rpb24gYmFzZUZsYXR0ZW4oYXJyYXksIGlzU2hhbGxvdywgaXNTdHJpY3QsIGZyb21JbmRleCkge1xuICB2YXIgaW5kZXggPSAoZnJvbUluZGV4IHx8IDApIC0gMSxcbiAgICAgIGxlbmd0aCA9IGFycmF5ID8gYXJyYXkubGVuZ3RoIDogMCxcbiAgICAgIHJlc3VsdCA9IFtdO1xuXG4gIHdoaWxlICgrK2luZGV4IDwgbGVuZ3RoKSB7XG4gICAgdmFyIHZhbHVlID0gYXJyYXlbaW5kZXhdO1xuXG4gICAgaWYgKHZhbHVlICYmIHR5cGVvZiB2YWx1ZSA9PSAnb2JqZWN0JyAmJiB0eXBlb2YgdmFsdWUubGVuZ3RoID09ICdudW1iZXInXG4gICAgICAgICYmIChpc0FycmF5KHZhbHVlKSB8fCBpc0FyZ3VtZW50cyh2YWx1ZSkpKSB7XG4gICAgICAvLyByZWN1cnNpdmVseSBmbGF0dGVuIGFycmF5cyAoc3VzY2VwdGlibGUgdG8gY2FsbCBzdGFjayBsaW1pdHMpXG4gICAgICBpZiAoIWlzU2hhbGxvdykge1xuICAgICAgICB2YWx1ZSA9IGJhc2VGbGF0dGVuKHZhbHVlLCBpc1NoYWxsb3csIGlzU3RyaWN0KTtcbiAgICAgIH1cbiAgICAgIHZhciB2YWxJbmRleCA9IC0xLFxuICAgICAgICAgIHZhbExlbmd0aCA9IHZhbHVlLmxlbmd0aCxcbiAgICAgICAgICByZXNJbmRleCA9IHJlc3VsdC5sZW5ndGg7XG5cbiAgICAgIHJlc3VsdC5sZW5ndGggKz0gdmFsTGVuZ3RoO1xuICAgICAgd2hpbGUgKCsrdmFsSW5kZXggPCB2YWxMZW5ndGgpIHtcbiAgICAgICAgcmVzdWx0W3Jlc0luZGV4KytdID0gdmFsdWVbdmFsSW5kZXhdO1xuICAgICAgfVxuICAgIH0gZWxzZSBpZiAoIWlzU3RyaWN0KSB7XG4gICAgICByZXN1bHQucHVzaCh2YWx1ZSk7XG4gICAgfVxuICB9XG4gIHJldHVybiByZXN1bHQ7XG59XG5cbm1vZHVsZS5leHBvcnRzID0gYmFzZUZsYXR0ZW47XG4iLCIvKipcbiAqIExvLURhc2ggMi40LjEgKEN1c3RvbSBCdWlsZCkgPGh0dHA6Ly9sb2Rhc2guY29tLz5cbiAqIEJ1aWxkOiBgbG9kYXNoIG1vZHVsYXJpemUgbW9kZXJuIGV4cG9ydHM9XCJub2RlXCIgLW8gLi9tb2Rlcm4vYFxuICogQ29weXJpZ2h0IDIwMTItMjAxMyBUaGUgRG9qbyBGb3VuZGF0aW9uIDxodHRwOi8vZG9qb2ZvdW5kYXRpb24ub3JnLz5cbiAqIEJhc2VkIG9uIFVuZGVyc2NvcmUuanMgMS41LjIgPGh0dHA6Ly91bmRlcnNjb3JlanMub3JnL0xJQ0VOU0U+XG4gKiBDb3B5cmlnaHQgMjAwOS0yMDEzIEplcmVteSBBc2hrZW5hcywgRG9jdW1lbnRDbG91ZCBhbmQgSW52ZXN0aWdhdGl2ZSBSZXBvcnRlcnMgJiBFZGl0b3JzXG4gKiBBdmFpbGFibGUgdW5kZXIgTUlUIGxpY2Vuc2UgPGh0dHA6Ly9sb2Rhc2guY29tL2xpY2Vuc2U+XG4gKi9cblxuLyoqXG4gKiBUaGUgYmFzZSBpbXBsZW1lbnRhdGlvbiBvZiBgXy5pbmRleE9mYCB3aXRob3V0IHN1cHBvcnQgZm9yIGJpbmFyeSBzZWFyY2hlc1xuICogb3IgYGZyb21JbmRleGAgY29uc3RyYWludHMuXG4gKlxuICogQHByaXZhdGVcbiAqIEBwYXJhbSB7QXJyYXl9IGFycmF5IFRoZSBhcnJheSB0byBzZWFyY2guXG4gKiBAcGFyYW0geyp9IHZhbHVlIFRoZSB2YWx1ZSB0byBzZWFyY2ggZm9yLlxuICogQHBhcmFtIHtudW1iZXJ9IFtmcm9tSW5kZXg9MF0gVGhlIGluZGV4IHRvIHNlYXJjaCBmcm9tLlxuICogQHJldHVybnMge251bWJlcn0gUmV0dXJucyB0aGUgaW5kZXggb2YgdGhlIG1hdGNoZWQgdmFsdWUgb3IgYC0xYC5cbiAqL1xuZnVuY3Rpb24gYmFzZUluZGV4T2YoYXJyYXksIHZhbHVlLCBmcm9tSW5kZXgpIHtcbiAgdmFyIGluZGV4ID0gKGZyb21JbmRleCB8fCAwKSAtIDEsXG4gICAgICBsZW5ndGggPSBhcnJheSA/IGFycmF5Lmxlbmd0aCA6IDA7XG5cbiAgd2hpbGUgKCsraW5kZXggPCBsZW5ndGgpIHtcbiAgICBpZiAoYXJyYXlbaW5kZXhdID09PSB2YWx1ZSkge1xuICAgICAgcmV0dXJuIGluZGV4O1xuICAgIH1cbiAgfVxuICByZXR1cm4gLTE7XG59XG5cbm1vZHVsZS5leHBvcnRzID0gYmFzZUluZGV4T2Y7XG4iLCIvKipcbiAqIExvLURhc2ggMi40LjEgKEN1c3RvbSBCdWlsZCkgPGh0dHA6Ly9sb2Rhc2guY29tLz5cbiAqIEJ1aWxkOiBgbG9kYXNoIG1vZHVsYXJpemUgbW9kZXJuIGV4cG9ydHM9XCJub2RlXCIgLW8gLi9tb2Rlcm4vYFxuICogQ29weXJpZ2h0IDIwMTItMjAxMyBUaGUgRG9qbyBGb3VuZGF0aW9uIDxodHRwOi8vZG9qb2ZvdW5kYXRpb24ub3JnLz5cbiAqIEJhc2VkIG9uIFVuZGVyc2NvcmUuanMgMS41LjIgPGh0dHA6Ly91bmRlcnNjb3JlanMub3JnL0xJQ0VOU0U+XG4gKiBDb3B5cmlnaHQgMjAwOS0yMDEzIEplcmVteSBBc2hrZW5hcywgRG9jdW1lbnRDbG91ZCBhbmQgSW52ZXN0aWdhdGl2ZSBSZXBvcnRlcnMgJiBFZGl0b3JzXG4gKiBBdmFpbGFibGUgdW5kZXIgTUlUIGxpY2Vuc2UgPGh0dHA6Ly9sb2Rhc2guY29tL2xpY2Vuc2U+XG4gKi9cbnZhciBmb3JJbiA9IHJlcXVpcmUoJy4uL29iamVjdHMvZm9ySW4nKSxcbiAgICBnZXRBcnJheSA9IHJlcXVpcmUoJy4vZ2V0QXJyYXknKSxcbiAgICBpc0Z1bmN0aW9uID0gcmVxdWlyZSgnLi4vb2JqZWN0cy9pc0Z1bmN0aW9uJyksXG4gICAgb2JqZWN0VHlwZXMgPSByZXF1aXJlKCcuL29iamVjdFR5cGVzJyksXG4gICAgcmVsZWFzZUFycmF5ID0gcmVxdWlyZSgnLi9yZWxlYXNlQXJyYXknKTtcblxuLyoqIGBPYmplY3QjdG9TdHJpbmdgIHJlc3VsdCBzaG9ydGN1dHMgKi9cbnZhciBhcmdzQ2xhc3MgPSAnW29iamVjdCBBcmd1bWVudHNdJyxcbiAgICBhcnJheUNsYXNzID0gJ1tvYmplY3QgQXJyYXldJyxcbiAgICBib29sQ2xhc3MgPSAnW29iamVjdCBCb29sZWFuXScsXG4gICAgZGF0ZUNsYXNzID0gJ1tvYmplY3QgRGF0ZV0nLFxuICAgIG51bWJlckNsYXNzID0gJ1tvYmplY3QgTnVtYmVyXScsXG4gICAgb2JqZWN0Q2xhc3MgPSAnW29iamVjdCBPYmplY3RdJyxcbiAgICByZWdleHBDbGFzcyA9ICdbb2JqZWN0IFJlZ0V4cF0nLFxuICAgIHN0cmluZ0NsYXNzID0gJ1tvYmplY3QgU3RyaW5nXSc7XG5cbi8qKiBVc2VkIGZvciBuYXRpdmUgbWV0aG9kIHJlZmVyZW5jZXMgKi9cbnZhciBvYmplY3RQcm90byA9IE9iamVjdC5wcm90b3R5cGU7XG5cbi8qKiBVc2VkIHRvIHJlc29sdmUgdGhlIGludGVybmFsIFtbQ2xhc3NdXSBvZiB2YWx1ZXMgKi9cbnZhciB0b1N0cmluZyA9IG9iamVjdFByb3RvLnRvU3RyaW5nO1xuXG4vKiogTmF0aXZlIG1ldGhvZCBzaG9ydGN1dHMgKi9cbnZhciBoYXNPd25Qcm9wZXJ0eSA9IG9iamVjdFByb3RvLmhhc093blByb3BlcnR5O1xuXG4vKipcbiAqIFRoZSBiYXNlIGltcGxlbWVudGF0aW9uIG9mIGBfLmlzRXF1YWxgLCB3aXRob3V0IHN1cHBvcnQgZm9yIGB0aGlzQXJnYCBiaW5kaW5nLFxuICogdGhhdCBhbGxvd3MgcGFydGlhbCBcIl8ud2hlcmVcIiBzdHlsZSBjb21wYXJpc29ucy5cbiAqXG4gKiBAcHJpdmF0ZVxuICogQHBhcmFtIHsqfSBhIFRoZSB2YWx1ZSB0byBjb21wYXJlLlxuICogQHBhcmFtIHsqfSBiIFRoZSBvdGhlciB2YWx1ZSB0byBjb21wYXJlLlxuICogQHBhcmFtIHtGdW5jdGlvbn0gW2NhbGxiYWNrXSBUaGUgZnVuY3Rpb24gdG8gY3VzdG9taXplIGNvbXBhcmluZyB2YWx1ZXMuXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBbaXNXaGVyZT1mYWxzZV0gQSBmbGFnIHRvIGluZGljYXRlIHBlcmZvcm1pbmcgcGFydGlhbCBjb21wYXJpc29ucy5cbiAqIEBwYXJhbSB7QXJyYXl9IFtzdGFja0E9W11dIFRyYWNrcyB0cmF2ZXJzZWQgYGFgIG9iamVjdHMuXG4gKiBAcGFyYW0ge0FycmF5fSBbc3RhY2tCPVtdXSBUcmFja3MgdHJhdmVyc2VkIGBiYCBvYmplY3RzLlxuICogQHJldHVybnMge2Jvb2xlYW59IFJldHVybnMgYHRydWVgIGlmIHRoZSB2YWx1ZXMgYXJlIGVxdWl2YWxlbnQsIGVsc2UgYGZhbHNlYC5cbiAqL1xuZnVuY3Rpb24gYmFzZUlzRXF1YWwoYSwgYiwgY2FsbGJhY2ssIGlzV2hlcmUsIHN0YWNrQSwgc3RhY2tCKSB7XG4gIC8vIHVzZWQgdG8gaW5kaWNhdGUgdGhhdCB3aGVuIGNvbXBhcmluZyBvYmplY3RzLCBgYWAgaGFzIGF0IGxlYXN0IHRoZSBwcm9wZXJ0aWVzIG9mIGBiYFxuICBpZiAoY2FsbGJhY2spIHtcbiAgICB2YXIgcmVzdWx0ID0gY2FsbGJhY2soYSwgYik7XG4gICAgaWYgKHR5cGVvZiByZXN1bHQgIT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgIHJldHVybiAhIXJlc3VsdDtcbiAgICB9XG4gIH1cbiAgLy8gZXhpdCBlYXJseSBmb3IgaWRlbnRpY2FsIHZhbHVlc1xuICBpZiAoYSA9PT0gYikge1xuICAgIC8vIHRyZWF0IGArMGAgdnMuIGAtMGAgYXMgbm90IGVxdWFsXG4gICAgcmV0dXJuIGEgIT09IDAgfHwgKDEgLyBhID09IDEgLyBiKTtcbiAgfVxuICB2YXIgdHlwZSA9IHR5cGVvZiBhLFxuICAgICAgb3RoZXJUeXBlID0gdHlwZW9mIGI7XG5cbiAgLy8gZXhpdCBlYXJseSBmb3IgdW5saWtlIHByaW1pdGl2ZSB2YWx1ZXNcbiAgaWYgKGEgPT09IGEgJiZcbiAgICAgICEoYSAmJiBvYmplY3RUeXBlc1t0eXBlXSkgJiZcbiAgICAgICEoYiAmJiBvYmplY3RUeXBlc1tvdGhlclR5cGVdKSkge1xuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuICAvLyBleGl0IGVhcmx5IGZvciBgbnVsbGAgYW5kIGB1bmRlZmluZWRgIGF2b2lkaW5nIEVTMydzIEZ1bmN0aW9uI2NhbGwgYmVoYXZpb3JcbiAgLy8gaHR0cDovL2VzNS5naXRodWIuaW8vI3gxNS4zLjQuNFxuICBpZiAoYSA9PSBudWxsIHx8IGIgPT0gbnVsbCkge1xuICAgIHJldHVybiBhID09PSBiO1xuICB9XG4gIC8vIGNvbXBhcmUgW1tDbGFzc11dIG5hbWVzXG4gIHZhciBjbGFzc05hbWUgPSB0b1N0cmluZy5jYWxsKGEpLFxuICAgICAgb3RoZXJDbGFzcyA9IHRvU3RyaW5nLmNhbGwoYik7XG5cbiAgaWYgKGNsYXNzTmFtZSA9PSBhcmdzQ2xhc3MpIHtcbiAgICBjbGFzc05hbWUgPSBvYmplY3RDbGFzcztcbiAgfVxuICBpZiAob3RoZXJDbGFzcyA9PSBhcmdzQ2xhc3MpIHtcbiAgICBvdGhlckNsYXNzID0gb2JqZWN0Q2xhc3M7XG4gIH1cbiAgaWYgKGNsYXNzTmFtZSAhPSBvdGhlckNsYXNzKSB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG4gIHN3aXRjaCAoY2xhc3NOYW1lKSB7XG4gICAgY2FzZSBib29sQ2xhc3M6XG4gICAgY2FzZSBkYXRlQ2xhc3M6XG4gICAgICAvLyBjb2VyY2UgZGF0ZXMgYW5kIGJvb2xlYW5zIHRvIG51bWJlcnMsIGRhdGVzIHRvIG1pbGxpc2Vjb25kcyBhbmQgYm9vbGVhbnNcbiAgICAgIC8vIHRvIGAxYCBvciBgMGAgdHJlYXRpbmcgaW52YWxpZCBkYXRlcyBjb2VyY2VkIHRvIGBOYU5gIGFzIG5vdCBlcXVhbFxuICAgICAgcmV0dXJuICthID09ICtiO1xuXG4gICAgY2FzZSBudW1iZXJDbGFzczpcbiAgICAgIC8vIHRyZWF0IGBOYU5gIHZzLiBgTmFOYCBhcyBlcXVhbFxuICAgICAgcmV0dXJuIChhICE9ICthKVxuICAgICAgICA/IGIgIT0gK2JcbiAgICAgICAgLy8gYnV0IHRyZWF0IGArMGAgdnMuIGAtMGAgYXMgbm90IGVxdWFsXG4gICAgICAgIDogKGEgPT0gMCA/ICgxIC8gYSA9PSAxIC8gYikgOiBhID09ICtiKTtcblxuICAgIGNhc2UgcmVnZXhwQ2xhc3M6XG4gICAgY2FzZSBzdHJpbmdDbGFzczpcbiAgICAgIC8vIGNvZXJjZSByZWdleGVzIHRvIHN0cmluZ3MgKGh0dHA6Ly9lczUuZ2l0aHViLmlvLyN4MTUuMTAuNi40KVxuICAgICAgLy8gdHJlYXQgc3RyaW5nIHByaW1pdGl2ZXMgYW5kIHRoZWlyIGNvcnJlc3BvbmRpbmcgb2JqZWN0IGluc3RhbmNlcyBhcyBlcXVhbFxuICAgICAgcmV0dXJuIGEgPT0gU3RyaW5nKGIpO1xuICB9XG4gIHZhciBpc0FyciA9IGNsYXNzTmFtZSA9PSBhcnJheUNsYXNzO1xuICBpZiAoIWlzQXJyKSB7XG4gICAgLy8gdW53cmFwIGFueSBgbG9kYXNoYCB3cmFwcGVkIHZhbHVlc1xuICAgIHZhciBhV3JhcHBlZCA9IGhhc093blByb3BlcnR5LmNhbGwoYSwgJ19fd3JhcHBlZF9fJyksXG4gICAgICAgIGJXcmFwcGVkID0gaGFzT3duUHJvcGVydHkuY2FsbChiLCAnX193cmFwcGVkX18nKTtcblxuICAgIGlmIChhV3JhcHBlZCB8fCBiV3JhcHBlZCkge1xuICAgICAgcmV0dXJuIGJhc2VJc0VxdWFsKGFXcmFwcGVkID8gYS5fX3dyYXBwZWRfXyA6IGEsIGJXcmFwcGVkID8gYi5fX3dyYXBwZWRfXyA6IGIsIGNhbGxiYWNrLCBpc1doZXJlLCBzdGFja0EsIHN0YWNrQik7XG4gICAgfVxuICAgIC8vIGV4aXQgZm9yIGZ1bmN0aW9ucyBhbmQgRE9NIG5vZGVzXG4gICAgaWYgKGNsYXNzTmFtZSAhPSBvYmplY3RDbGFzcykge1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbiAgICAvLyBpbiBvbGRlciB2ZXJzaW9ucyBvZiBPcGVyYSwgYGFyZ3VtZW50c2Agb2JqZWN0cyBoYXZlIGBBcnJheWAgY29uc3RydWN0b3JzXG4gICAgdmFyIGN0b3JBID0gYS5jb25zdHJ1Y3RvcixcbiAgICAgICAgY3RvckIgPSBiLmNvbnN0cnVjdG9yO1xuXG4gICAgLy8gbm9uIGBPYmplY3RgIG9iamVjdCBpbnN0YW5jZXMgd2l0aCBkaWZmZXJlbnQgY29uc3RydWN0b3JzIGFyZSBub3QgZXF1YWxcbiAgICBpZiAoY3RvckEgIT0gY3RvckIgJiZcbiAgICAgICAgICAhKGlzRnVuY3Rpb24oY3RvckEpICYmIGN0b3JBIGluc3RhbmNlb2YgY3RvckEgJiYgaXNGdW5jdGlvbihjdG9yQikgJiYgY3RvckIgaW5zdGFuY2VvZiBjdG9yQikgJiZcbiAgICAgICAgICAoJ2NvbnN0cnVjdG9yJyBpbiBhICYmICdjb25zdHJ1Y3RvcicgaW4gYilcbiAgICAgICAgKSB7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuICB9XG4gIC8vIGFzc3VtZSBjeWNsaWMgc3RydWN0dXJlcyBhcmUgZXF1YWxcbiAgLy8gdGhlIGFsZ29yaXRobSBmb3IgZGV0ZWN0aW5nIGN5Y2xpYyBzdHJ1Y3R1cmVzIGlzIGFkYXB0ZWQgZnJvbSBFUyA1LjFcbiAgLy8gc2VjdGlvbiAxNS4xMi4zLCBhYnN0cmFjdCBvcGVyYXRpb24gYEpPYCAoaHR0cDovL2VzNS5naXRodWIuaW8vI3gxNS4xMi4zKVxuICB2YXIgaW5pdGVkU3RhY2sgPSAhc3RhY2tBO1xuICBzdGFja0EgfHwgKHN0YWNrQSA9IGdldEFycmF5KCkpO1xuICBzdGFja0IgfHwgKHN0YWNrQiA9IGdldEFycmF5KCkpO1xuXG4gIHZhciBsZW5ndGggPSBzdGFja0EubGVuZ3RoO1xuICB3aGlsZSAobGVuZ3RoLS0pIHtcbiAgICBpZiAoc3RhY2tBW2xlbmd0aF0gPT0gYSkge1xuICAgICAgcmV0dXJuIHN0YWNrQltsZW5ndGhdID09IGI7XG4gICAgfVxuICB9XG4gIHZhciBzaXplID0gMDtcbiAgcmVzdWx0ID0gdHJ1ZTtcblxuICAvLyBhZGQgYGFgIGFuZCBgYmAgdG8gdGhlIHN0YWNrIG9mIHRyYXZlcnNlZCBvYmplY3RzXG4gIHN0YWNrQS5wdXNoKGEpO1xuICBzdGFja0IucHVzaChiKTtcblxuICAvLyByZWN1cnNpdmVseSBjb21wYXJlIG9iamVjdHMgYW5kIGFycmF5cyAoc3VzY2VwdGlibGUgdG8gY2FsbCBzdGFjayBsaW1pdHMpXG4gIGlmIChpc0Fycikge1xuICAgIC8vIGNvbXBhcmUgbGVuZ3RocyB0byBkZXRlcm1pbmUgaWYgYSBkZWVwIGNvbXBhcmlzb24gaXMgbmVjZXNzYXJ5XG4gICAgbGVuZ3RoID0gYS5sZW5ndGg7XG4gICAgc2l6ZSA9IGIubGVuZ3RoO1xuICAgIHJlc3VsdCA9IHNpemUgPT0gbGVuZ3RoO1xuXG4gICAgaWYgKHJlc3VsdCB8fCBpc1doZXJlKSB7XG4gICAgICAvLyBkZWVwIGNvbXBhcmUgdGhlIGNvbnRlbnRzLCBpZ25vcmluZyBub24tbnVtZXJpYyBwcm9wZXJ0aWVzXG4gICAgICB3aGlsZSAoc2l6ZS0tKSB7XG4gICAgICAgIHZhciBpbmRleCA9IGxlbmd0aCxcbiAgICAgICAgICAgIHZhbHVlID0gYltzaXplXTtcblxuICAgICAgICBpZiAoaXNXaGVyZSkge1xuICAgICAgICAgIHdoaWxlIChpbmRleC0tKSB7XG4gICAgICAgICAgICBpZiAoKHJlc3VsdCA9IGJhc2VJc0VxdWFsKGFbaW5kZXhdLCB2YWx1ZSwgY2FsbGJhY2ssIGlzV2hlcmUsIHN0YWNrQSwgc3RhY2tCKSkpIHtcbiAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICB9IGVsc2UgaWYgKCEocmVzdWx0ID0gYmFzZUlzRXF1YWwoYVtzaXplXSwgdmFsdWUsIGNhbGxiYWNrLCBpc1doZXJlLCBzdGFja0EsIHN0YWNrQikpKSB7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gIH1cbiAgZWxzZSB7XG4gICAgLy8gZGVlcCBjb21wYXJlIG9iamVjdHMgdXNpbmcgYGZvckluYCwgaW5zdGVhZCBvZiBgZm9yT3duYCwgdG8gYXZvaWQgYE9iamVjdC5rZXlzYFxuICAgIC8vIHdoaWNoLCBpbiB0aGlzIGNhc2UsIGlzIG1vcmUgY29zdGx5XG4gICAgZm9ySW4oYiwgZnVuY3Rpb24odmFsdWUsIGtleSwgYikge1xuICAgICAgaWYgKGhhc093blByb3BlcnR5LmNhbGwoYiwga2V5KSkge1xuICAgICAgICAvLyBjb3VudCB0aGUgbnVtYmVyIG9mIHByb3BlcnRpZXMuXG4gICAgICAgIHNpemUrKztcbiAgICAgICAgLy8gZGVlcCBjb21wYXJlIGVhY2ggcHJvcGVydHkgdmFsdWUuXG4gICAgICAgIHJldHVybiAocmVzdWx0ID0gaGFzT3duUHJvcGVydHkuY2FsbChhLCBrZXkpICYmIGJhc2VJc0VxdWFsKGFba2V5XSwgdmFsdWUsIGNhbGxiYWNrLCBpc1doZXJlLCBzdGFja0EsIHN0YWNrQikpO1xuICAgICAgfVxuICAgIH0pO1xuXG4gICAgaWYgKHJlc3VsdCAmJiAhaXNXaGVyZSkge1xuICAgICAgLy8gZW5zdXJlIGJvdGggb2JqZWN0cyBoYXZlIHRoZSBzYW1lIG51bWJlciBvZiBwcm9wZXJ0aWVzXG4gICAgICBmb3JJbihhLCBmdW5jdGlvbih2YWx1ZSwga2V5LCBhKSB7XG4gICAgICAgIGlmIChoYXNPd25Qcm9wZXJ0eS5jYWxsKGEsIGtleSkpIHtcbiAgICAgICAgICAvLyBgc2l6ZWAgd2lsbCBiZSBgLTFgIGlmIGBhYCBoYXMgbW9yZSBwcm9wZXJ0aWVzIHRoYW4gYGJgXG4gICAgICAgICAgcmV0dXJuIChyZXN1bHQgPSAtLXNpemUgPiAtMSk7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgIH1cbiAgfVxuICBzdGFja0EucG9wKCk7XG4gIHN0YWNrQi5wb3AoKTtcblxuICBpZiAoaW5pdGVkU3RhY2spIHtcbiAgICByZWxlYXNlQXJyYXkoc3RhY2tBKTtcbiAgICByZWxlYXNlQXJyYXkoc3RhY2tCKTtcbiAgfVxuICByZXR1cm4gcmVzdWx0O1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IGJhc2VJc0VxdWFsO1xuIiwiLyoqXG4gKiBMby1EYXNoIDIuNC4xIChDdXN0b20gQnVpbGQpIDxodHRwOi8vbG9kYXNoLmNvbS8+XG4gKiBCdWlsZDogYGxvZGFzaCBtb2R1bGFyaXplIG1vZGVybiBleHBvcnRzPVwibm9kZVwiIC1vIC4vbW9kZXJuL2BcbiAqIENvcHlyaWdodCAyMDEyLTIwMTMgVGhlIERvam8gRm91bmRhdGlvbiA8aHR0cDovL2Rvam9mb3VuZGF0aW9uLm9yZy8+XG4gKiBCYXNlZCBvbiBVbmRlcnNjb3JlLmpzIDEuNS4yIDxodHRwOi8vdW5kZXJzY29yZWpzLm9yZy9MSUNFTlNFPlxuICogQ29weXJpZ2h0IDIwMDktMjAxMyBKZXJlbXkgQXNoa2VuYXMsIERvY3VtZW50Q2xvdWQgYW5kIEludmVzdGlnYXRpdmUgUmVwb3J0ZXJzICYgRWRpdG9yc1xuICogQXZhaWxhYmxlIHVuZGVyIE1JVCBsaWNlbnNlIDxodHRwOi8vbG9kYXNoLmNvbS9saWNlbnNlPlxuICovXG52YXIgYmFzZUluZGV4T2YgPSByZXF1aXJlKCcuL2Jhc2VJbmRleE9mJyksXG4gICAga2V5UHJlZml4ID0gcmVxdWlyZSgnLi9rZXlQcmVmaXgnKTtcblxuLyoqXG4gKiBBbiBpbXBsZW1lbnRhdGlvbiBvZiBgXy5jb250YWluc2AgZm9yIGNhY2hlIG9iamVjdHMgdGhhdCBtaW1pY3MgdGhlIHJldHVyblxuICogc2lnbmF0dXJlIG9mIGBfLmluZGV4T2ZgIGJ5IHJldHVybmluZyBgMGAgaWYgdGhlIHZhbHVlIGlzIGZvdW5kLCBlbHNlIGAtMWAuXG4gKlxuICogQHByaXZhdGVcbiAqIEBwYXJhbSB7T2JqZWN0fSBjYWNoZSBUaGUgY2FjaGUgb2JqZWN0IHRvIGluc3BlY3QuXG4gKiBAcGFyYW0geyp9IHZhbHVlIFRoZSB2YWx1ZSB0byBzZWFyY2ggZm9yLlxuICogQHJldHVybnMge251bWJlcn0gUmV0dXJucyBgMGAgaWYgYHZhbHVlYCBpcyBmb3VuZCwgZWxzZSBgLTFgLlxuICovXG5mdW5jdGlvbiBjYWNoZUluZGV4T2YoY2FjaGUsIHZhbHVlKSB7XG4gIHZhciB0eXBlID0gdHlwZW9mIHZhbHVlO1xuICBjYWNoZSA9IGNhY2hlLmNhY2hlO1xuXG4gIGlmICh0eXBlID09ICdib29sZWFuJyB8fCB2YWx1ZSA9PSBudWxsKSB7XG4gICAgcmV0dXJuIGNhY2hlW3ZhbHVlXSA/IDAgOiAtMTtcbiAgfVxuICBpZiAodHlwZSAhPSAnbnVtYmVyJyAmJiB0eXBlICE9ICdzdHJpbmcnKSB7XG4gICAgdHlwZSA9ICdvYmplY3QnO1xuICB9XG4gIHZhciBrZXkgPSB0eXBlID09ICdudW1iZXInID8gdmFsdWUgOiBrZXlQcmVmaXggKyB2YWx1ZTtcbiAgY2FjaGUgPSAoY2FjaGUgPSBjYWNoZVt0eXBlXSkgJiYgY2FjaGVba2V5XTtcblxuICByZXR1cm4gdHlwZSA9PSAnb2JqZWN0J1xuICAgID8gKGNhY2hlICYmIGJhc2VJbmRleE9mKGNhY2hlLCB2YWx1ZSkgPiAtMSA/IDAgOiAtMSlcbiAgICA6IChjYWNoZSA/IDAgOiAtMSk7XG59XG5cbm1vZHVsZS5leHBvcnRzID0gY2FjaGVJbmRleE9mO1xuIiwiLyoqXG4gKiBMby1EYXNoIDIuNC4xIChDdXN0b20gQnVpbGQpIDxodHRwOi8vbG9kYXNoLmNvbS8+XG4gKiBCdWlsZDogYGxvZGFzaCBtb2R1bGFyaXplIG1vZGVybiBleHBvcnRzPVwibm9kZVwiIC1vIC4vbW9kZXJuL2BcbiAqIENvcHlyaWdodCAyMDEyLTIwMTMgVGhlIERvam8gRm91bmRhdGlvbiA8aHR0cDovL2Rvam9mb3VuZGF0aW9uLm9yZy8+XG4gKiBCYXNlZCBvbiBVbmRlcnNjb3JlLmpzIDEuNS4yIDxodHRwOi8vdW5kZXJzY29yZWpzLm9yZy9MSUNFTlNFPlxuICogQ29weXJpZ2h0IDIwMDktMjAxMyBKZXJlbXkgQXNoa2VuYXMsIERvY3VtZW50Q2xvdWQgYW5kIEludmVzdGlnYXRpdmUgUmVwb3J0ZXJzICYgRWRpdG9yc1xuICogQXZhaWxhYmxlIHVuZGVyIE1JVCBsaWNlbnNlIDxodHRwOi8vbG9kYXNoLmNvbS9saWNlbnNlPlxuICovXG52YXIga2V5UHJlZml4ID0gcmVxdWlyZSgnLi9rZXlQcmVmaXgnKTtcblxuLyoqXG4gKiBBZGRzIGEgZ2l2ZW4gdmFsdWUgdG8gdGhlIGNvcnJlc3BvbmRpbmcgY2FjaGUgb2JqZWN0LlxuICpcbiAqIEBwcml2YXRlXG4gKiBAcGFyYW0geyp9IHZhbHVlIFRoZSB2YWx1ZSB0byBhZGQgdG8gdGhlIGNhY2hlLlxuICovXG5mdW5jdGlvbiBjYWNoZVB1c2godmFsdWUpIHtcbiAgdmFyIGNhY2hlID0gdGhpcy5jYWNoZSxcbiAgICAgIHR5cGUgPSB0eXBlb2YgdmFsdWU7XG5cbiAgaWYgKHR5cGUgPT0gJ2Jvb2xlYW4nIHx8IHZhbHVlID09IG51bGwpIHtcbiAgICBjYWNoZVt2YWx1ZV0gPSB0cnVlO1xuICB9IGVsc2Uge1xuICAgIGlmICh0eXBlICE9ICdudW1iZXInICYmIHR5cGUgIT0gJ3N0cmluZycpIHtcbiAgICAgIHR5cGUgPSAnb2JqZWN0JztcbiAgICB9XG4gICAgdmFyIGtleSA9IHR5cGUgPT0gJ251bWJlcicgPyB2YWx1ZSA6IGtleVByZWZpeCArIHZhbHVlLFxuICAgICAgICB0eXBlQ2FjaGUgPSBjYWNoZVt0eXBlXSB8fCAoY2FjaGVbdHlwZV0gPSB7fSk7XG5cbiAgICBpZiAodHlwZSA9PSAnb2JqZWN0Jykge1xuICAgICAgKHR5cGVDYWNoZVtrZXldIHx8ICh0eXBlQ2FjaGVba2V5XSA9IFtdKSkucHVzaCh2YWx1ZSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHR5cGVDYWNoZVtrZXldID0gdHJ1ZTtcbiAgICB9XG4gIH1cbn1cblxubW9kdWxlLmV4cG9ydHMgPSBjYWNoZVB1c2g7XG4iLCIvKipcbiAqIExvLURhc2ggMi40LjEgKEN1c3RvbSBCdWlsZCkgPGh0dHA6Ly9sb2Rhc2guY29tLz5cbiAqIEJ1aWxkOiBgbG9kYXNoIG1vZHVsYXJpemUgbW9kZXJuIGV4cG9ydHM9XCJub2RlXCIgLW8gLi9tb2Rlcm4vYFxuICogQ29weXJpZ2h0IDIwMTItMjAxMyBUaGUgRG9qbyBGb3VuZGF0aW9uIDxodHRwOi8vZG9qb2ZvdW5kYXRpb24ub3JnLz5cbiAqIEJhc2VkIG9uIFVuZGVyc2NvcmUuanMgMS41LjIgPGh0dHA6Ly91bmRlcnNjb3JlanMub3JnL0xJQ0VOU0U+XG4gKiBDb3B5cmlnaHQgMjAwOS0yMDEzIEplcmVteSBBc2hrZW5hcywgRG9jdW1lbnRDbG91ZCBhbmQgSW52ZXN0aWdhdGl2ZSBSZXBvcnRlcnMgJiBFZGl0b3JzXG4gKiBBdmFpbGFibGUgdW5kZXIgTUlUIGxpY2Vuc2UgPGh0dHA6Ly9sb2Rhc2guY29tL2xpY2Vuc2U+XG4gKi9cbnZhciBjYWNoZVB1c2ggPSByZXF1aXJlKCcuL2NhY2hlUHVzaCcpLFxuICAgIGdldE9iamVjdCA9IHJlcXVpcmUoJy4vZ2V0T2JqZWN0JyksXG4gICAgcmVsZWFzZU9iamVjdCA9IHJlcXVpcmUoJy4vcmVsZWFzZU9iamVjdCcpO1xuXG4vKipcbiAqIENyZWF0ZXMgYSBjYWNoZSBvYmplY3QgdG8gb3B0aW1pemUgbGluZWFyIHNlYXJjaGVzIG9mIGxhcmdlIGFycmF5cy5cbiAqXG4gKiBAcHJpdmF0ZVxuICogQHBhcmFtIHtBcnJheX0gW2FycmF5PVtdXSBUaGUgYXJyYXkgdG8gc2VhcmNoLlxuICogQHJldHVybnMge251bGx8T2JqZWN0fSBSZXR1cm5zIHRoZSBjYWNoZSBvYmplY3Qgb3IgYG51bGxgIGlmIGNhY2hpbmcgc2hvdWxkIG5vdCBiZSB1c2VkLlxuICovXG5mdW5jdGlvbiBjcmVhdGVDYWNoZShhcnJheSkge1xuICB2YXIgaW5kZXggPSAtMSxcbiAgICAgIGxlbmd0aCA9IGFycmF5Lmxlbmd0aCxcbiAgICAgIGZpcnN0ID0gYXJyYXlbMF0sXG4gICAgICBtaWQgPSBhcnJheVsobGVuZ3RoIC8gMikgfCAwXSxcbiAgICAgIGxhc3QgPSBhcnJheVtsZW5ndGggLSAxXTtcblxuICBpZiAoZmlyc3QgJiYgdHlwZW9mIGZpcnN0ID09ICdvYmplY3QnICYmXG4gICAgICBtaWQgJiYgdHlwZW9mIG1pZCA9PSAnb2JqZWN0JyAmJiBsYXN0ICYmIHR5cGVvZiBsYXN0ID09ICdvYmplY3QnKSB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG4gIHZhciBjYWNoZSA9IGdldE9iamVjdCgpO1xuICBjYWNoZVsnZmFsc2UnXSA9IGNhY2hlWydudWxsJ10gPSBjYWNoZVsndHJ1ZSddID0gY2FjaGVbJ3VuZGVmaW5lZCddID0gZmFsc2U7XG5cbiAgdmFyIHJlc3VsdCA9IGdldE9iamVjdCgpO1xuICByZXN1bHQuYXJyYXkgPSBhcnJheTtcbiAgcmVzdWx0LmNhY2hlID0gY2FjaGU7XG4gIHJlc3VsdC5wdXNoID0gY2FjaGVQdXNoO1xuXG4gIHdoaWxlICgrK2luZGV4IDwgbGVuZ3RoKSB7XG4gICAgcmVzdWx0LnB1c2goYXJyYXlbaW5kZXhdKTtcbiAgfVxuICByZXR1cm4gcmVzdWx0O1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IGNyZWF0ZUNhY2hlO1xuIiwiLyoqXG4gKiBMby1EYXNoIDIuNC4xIChDdXN0b20gQnVpbGQpIDxodHRwOi8vbG9kYXNoLmNvbS8+XG4gKiBCdWlsZDogYGxvZGFzaCBtb2R1bGFyaXplIG1vZGVybiBleHBvcnRzPVwibm9kZVwiIC1vIC4vbW9kZXJuL2BcbiAqIENvcHlyaWdodCAyMDEyLTIwMTMgVGhlIERvam8gRm91bmRhdGlvbiA8aHR0cDovL2Rvam9mb3VuZGF0aW9uLm9yZy8+XG4gKiBCYXNlZCBvbiBVbmRlcnNjb3JlLmpzIDEuNS4yIDxodHRwOi8vdW5kZXJzY29yZWpzLm9yZy9MSUNFTlNFPlxuICogQ29weXJpZ2h0IDIwMDktMjAxMyBKZXJlbXkgQXNoa2VuYXMsIERvY3VtZW50Q2xvdWQgYW5kIEludmVzdGlnYXRpdmUgUmVwb3J0ZXJzICYgRWRpdG9yc1xuICogQXZhaWxhYmxlIHVuZGVyIE1JVCBsaWNlbnNlIDxodHRwOi8vbG9kYXNoLmNvbS9saWNlbnNlPlxuICovXG52YXIgYmFzZUJpbmQgPSByZXF1aXJlKCcuL2Jhc2VCaW5kJyksXG4gICAgYmFzZUNyZWF0ZVdyYXBwZXIgPSByZXF1aXJlKCcuL2Jhc2VDcmVhdGVXcmFwcGVyJyksXG4gICAgaXNGdW5jdGlvbiA9IHJlcXVpcmUoJy4uL29iamVjdHMvaXNGdW5jdGlvbicpLFxuICAgIHNsaWNlID0gcmVxdWlyZSgnLi9zbGljZScpO1xuXG4vKipcbiAqIFVzZWQgZm9yIGBBcnJheWAgbWV0aG9kIHJlZmVyZW5jZXMuXG4gKlxuICogTm9ybWFsbHkgYEFycmF5LnByb3RvdHlwZWAgd291bGQgc3VmZmljZSwgaG93ZXZlciwgdXNpbmcgYW4gYXJyYXkgbGl0ZXJhbFxuICogYXZvaWRzIGlzc3VlcyBpbiBOYXJ3aGFsLlxuICovXG52YXIgYXJyYXlSZWYgPSBbXTtcblxuLyoqIE5hdGl2ZSBtZXRob2Qgc2hvcnRjdXRzICovXG52YXIgcHVzaCA9IGFycmF5UmVmLnB1c2gsXG4gICAgdW5zaGlmdCA9IGFycmF5UmVmLnVuc2hpZnQ7XG5cbi8qKlxuICogQ3JlYXRlcyBhIGZ1bmN0aW9uIHRoYXQsIHdoZW4gY2FsbGVkLCBlaXRoZXIgY3VycmllcyBvciBpbnZva2VzIGBmdW5jYFxuICogd2l0aCBhbiBvcHRpb25hbCBgdGhpc2AgYmluZGluZyBhbmQgcGFydGlhbGx5IGFwcGxpZWQgYXJndW1lbnRzLlxuICpcbiAqIEBwcml2YXRlXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufHN0cmluZ30gZnVuYyBUaGUgZnVuY3Rpb24gb3IgbWV0aG9kIG5hbWUgdG8gcmVmZXJlbmNlLlxuICogQHBhcmFtIHtudW1iZXJ9IGJpdG1hc2sgVGhlIGJpdG1hc2sgb2YgbWV0aG9kIGZsYWdzIHRvIGNvbXBvc2UuXG4gKiAgVGhlIGJpdG1hc2sgbWF5IGJlIGNvbXBvc2VkIG9mIHRoZSBmb2xsb3dpbmcgZmxhZ3M6XG4gKiAgMSAtIGBfLmJpbmRgXG4gKiAgMiAtIGBfLmJpbmRLZXlgXG4gKiAgNCAtIGBfLmN1cnJ5YFxuICogIDggLSBgXy5jdXJyeWAgKGJvdW5kKVxuICogIDE2IC0gYF8ucGFydGlhbGBcbiAqICAzMiAtIGBfLnBhcnRpYWxSaWdodGBcbiAqIEBwYXJhbSB7QXJyYXl9IFtwYXJ0aWFsQXJnc10gQW4gYXJyYXkgb2YgYXJndW1lbnRzIHRvIHByZXBlbmQgdG8gdGhvc2VcbiAqICBwcm92aWRlZCB0byB0aGUgbmV3IGZ1bmN0aW9uLlxuICogQHBhcmFtIHtBcnJheX0gW3BhcnRpYWxSaWdodEFyZ3NdIEFuIGFycmF5IG9mIGFyZ3VtZW50cyB0byBhcHBlbmQgdG8gdGhvc2VcbiAqICBwcm92aWRlZCB0byB0aGUgbmV3IGZ1bmN0aW9uLlxuICogQHBhcmFtIHsqfSBbdGhpc0FyZ10gVGhlIGB0aGlzYCBiaW5kaW5nIG9mIGBmdW5jYC5cbiAqIEBwYXJhbSB7bnVtYmVyfSBbYXJpdHldIFRoZSBhcml0eSBvZiBgZnVuY2AuXG4gKiBAcmV0dXJucyB7RnVuY3Rpb259IFJldHVybnMgdGhlIG5ldyBmdW5jdGlvbi5cbiAqL1xuZnVuY3Rpb24gY3JlYXRlV3JhcHBlcihmdW5jLCBiaXRtYXNrLCBwYXJ0aWFsQXJncywgcGFydGlhbFJpZ2h0QXJncywgdGhpc0FyZywgYXJpdHkpIHtcbiAgdmFyIGlzQmluZCA9IGJpdG1hc2sgJiAxLFxuICAgICAgaXNCaW5kS2V5ID0gYml0bWFzayAmIDIsXG4gICAgICBpc0N1cnJ5ID0gYml0bWFzayAmIDQsXG4gICAgICBpc0N1cnJ5Qm91bmQgPSBiaXRtYXNrICYgOCxcbiAgICAgIGlzUGFydGlhbCA9IGJpdG1hc2sgJiAxNixcbiAgICAgIGlzUGFydGlhbFJpZ2h0ID0gYml0bWFzayAmIDMyO1xuXG4gIGlmICghaXNCaW5kS2V5ICYmICFpc0Z1bmN0aW9uKGZ1bmMpKSB7XG4gICAgdGhyb3cgbmV3IFR5cGVFcnJvcjtcbiAgfVxuICBpZiAoaXNQYXJ0aWFsICYmICFwYXJ0aWFsQXJncy5sZW5ndGgpIHtcbiAgICBiaXRtYXNrICY9IH4xNjtcbiAgICBpc1BhcnRpYWwgPSBwYXJ0aWFsQXJncyA9IGZhbHNlO1xuICB9XG4gIGlmIChpc1BhcnRpYWxSaWdodCAmJiAhcGFydGlhbFJpZ2h0QXJncy5sZW5ndGgpIHtcbiAgICBiaXRtYXNrICY9IH4zMjtcbiAgICBpc1BhcnRpYWxSaWdodCA9IHBhcnRpYWxSaWdodEFyZ3MgPSBmYWxzZTtcbiAgfVxuICB2YXIgYmluZERhdGEgPSBmdW5jICYmIGZ1bmMuX19iaW5kRGF0YV9fO1xuICBpZiAoYmluZERhdGEgJiYgYmluZERhdGEgIT09IHRydWUpIHtcbiAgICAvLyBjbG9uZSBgYmluZERhdGFgXG4gICAgYmluZERhdGEgPSBzbGljZShiaW5kRGF0YSk7XG4gICAgaWYgKGJpbmREYXRhWzJdKSB7XG4gICAgICBiaW5kRGF0YVsyXSA9IHNsaWNlKGJpbmREYXRhWzJdKTtcbiAgICB9XG4gICAgaWYgKGJpbmREYXRhWzNdKSB7XG4gICAgICBiaW5kRGF0YVszXSA9IHNsaWNlKGJpbmREYXRhWzNdKTtcbiAgICB9XG4gICAgLy8gc2V0IGB0aGlzQmluZGluZ2AgaXMgbm90IHByZXZpb3VzbHkgYm91bmRcbiAgICBpZiAoaXNCaW5kICYmICEoYmluZERhdGFbMV0gJiAxKSkge1xuICAgICAgYmluZERhdGFbNF0gPSB0aGlzQXJnO1xuICAgIH1cbiAgICAvLyBzZXQgaWYgcHJldmlvdXNseSBib3VuZCBidXQgbm90IGN1cnJlbnRseSAoc3Vic2VxdWVudCBjdXJyaWVkIGZ1bmN0aW9ucylcbiAgICBpZiAoIWlzQmluZCAmJiBiaW5kRGF0YVsxXSAmIDEpIHtcbiAgICAgIGJpdG1hc2sgfD0gODtcbiAgICB9XG4gICAgLy8gc2V0IGN1cnJpZWQgYXJpdHkgaWYgbm90IHlldCBzZXRcbiAgICBpZiAoaXNDdXJyeSAmJiAhKGJpbmREYXRhWzFdICYgNCkpIHtcbiAgICAgIGJpbmREYXRhWzVdID0gYXJpdHk7XG4gICAgfVxuICAgIC8vIGFwcGVuZCBwYXJ0aWFsIGxlZnQgYXJndW1lbnRzXG4gICAgaWYgKGlzUGFydGlhbCkge1xuICAgICAgcHVzaC5hcHBseShiaW5kRGF0YVsyXSB8fCAoYmluZERhdGFbMl0gPSBbXSksIHBhcnRpYWxBcmdzKTtcbiAgICB9XG4gICAgLy8gYXBwZW5kIHBhcnRpYWwgcmlnaHQgYXJndW1lbnRzXG4gICAgaWYgKGlzUGFydGlhbFJpZ2h0KSB7XG4gICAgICB1bnNoaWZ0LmFwcGx5KGJpbmREYXRhWzNdIHx8IChiaW5kRGF0YVszXSA9IFtdKSwgcGFydGlhbFJpZ2h0QXJncyk7XG4gICAgfVxuICAgIC8vIG1lcmdlIGZsYWdzXG4gICAgYmluZERhdGFbMV0gfD0gYml0bWFzaztcbiAgICByZXR1cm4gY3JlYXRlV3JhcHBlci5hcHBseShudWxsLCBiaW5kRGF0YSk7XG4gIH1cbiAgLy8gZmFzdCBwYXRoIGZvciBgXy5iaW5kYFxuICB2YXIgY3JlYXRlciA9IChiaXRtYXNrID09IDEgfHwgYml0bWFzayA9PT0gMTcpID8gYmFzZUJpbmQgOiBiYXNlQ3JlYXRlV3JhcHBlcjtcbiAgcmV0dXJuIGNyZWF0ZXIoW2Z1bmMsIGJpdG1hc2ssIHBhcnRpYWxBcmdzLCBwYXJ0aWFsUmlnaHRBcmdzLCB0aGlzQXJnLCBhcml0eV0pO1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IGNyZWF0ZVdyYXBwZXI7XG4iLCIvKipcbiAqIExvLURhc2ggMi40LjEgKEN1c3RvbSBCdWlsZCkgPGh0dHA6Ly9sb2Rhc2guY29tLz5cbiAqIEJ1aWxkOiBgbG9kYXNoIG1vZHVsYXJpemUgbW9kZXJuIGV4cG9ydHM9XCJub2RlXCIgLW8gLi9tb2Rlcm4vYFxuICogQ29weXJpZ2h0IDIwMTItMjAxMyBUaGUgRG9qbyBGb3VuZGF0aW9uIDxodHRwOi8vZG9qb2ZvdW5kYXRpb24ub3JnLz5cbiAqIEJhc2VkIG9uIFVuZGVyc2NvcmUuanMgMS41LjIgPGh0dHA6Ly91bmRlcnNjb3JlanMub3JnL0xJQ0VOU0U+XG4gKiBDb3B5cmlnaHQgMjAwOS0yMDEzIEplcmVteSBBc2hrZW5hcywgRG9jdW1lbnRDbG91ZCBhbmQgSW52ZXN0aWdhdGl2ZSBSZXBvcnRlcnMgJiBFZGl0b3JzXG4gKiBBdmFpbGFibGUgdW5kZXIgTUlUIGxpY2Vuc2UgPGh0dHA6Ly9sb2Rhc2guY29tL2xpY2Vuc2U+XG4gKi9cbnZhciBodG1sRXNjYXBlcyA9IHJlcXVpcmUoJy4vaHRtbEVzY2FwZXMnKTtcblxuLyoqXG4gKiBVc2VkIGJ5IGBlc2NhcGVgIHRvIGNvbnZlcnQgY2hhcmFjdGVycyB0byBIVE1MIGVudGl0aWVzLlxuICpcbiAqIEBwcml2YXRlXG4gKiBAcGFyYW0ge3N0cmluZ30gbWF0Y2ggVGhlIG1hdGNoZWQgY2hhcmFjdGVyIHRvIGVzY2FwZS5cbiAqIEByZXR1cm5zIHtzdHJpbmd9IFJldHVybnMgdGhlIGVzY2FwZWQgY2hhcmFjdGVyLlxuICovXG5mdW5jdGlvbiBlc2NhcGVIdG1sQ2hhcihtYXRjaCkge1xuICByZXR1cm4gaHRtbEVzY2FwZXNbbWF0Y2hdO1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IGVzY2FwZUh0bWxDaGFyO1xuIiwiLyoqXG4gKiBMby1EYXNoIDIuNC4xIChDdXN0b20gQnVpbGQpIDxodHRwOi8vbG9kYXNoLmNvbS8+XG4gKiBCdWlsZDogYGxvZGFzaCBtb2R1bGFyaXplIG1vZGVybiBleHBvcnRzPVwibm9kZVwiIC1vIC4vbW9kZXJuL2BcbiAqIENvcHlyaWdodCAyMDEyLTIwMTMgVGhlIERvam8gRm91bmRhdGlvbiA8aHR0cDovL2Rvam9mb3VuZGF0aW9uLm9yZy8+XG4gKiBCYXNlZCBvbiBVbmRlcnNjb3JlLmpzIDEuNS4yIDxodHRwOi8vdW5kZXJzY29yZWpzLm9yZy9MSUNFTlNFPlxuICogQ29weXJpZ2h0IDIwMDktMjAxMyBKZXJlbXkgQXNoa2VuYXMsIERvY3VtZW50Q2xvdWQgYW5kIEludmVzdGlnYXRpdmUgUmVwb3J0ZXJzICYgRWRpdG9yc1xuICogQXZhaWxhYmxlIHVuZGVyIE1JVCBsaWNlbnNlIDxodHRwOi8vbG9kYXNoLmNvbS9saWNlbnNlPlxuICovXG5cbi8qKiBVc2VkIHRvIGVzY2FwZSBjaGFyYWN0ZXJzIGZvciBpbmNsdXNpb24gaW4gY29tcGlsZWQgc3RyaW5nIGxpdGVyYWxzICovXG52YXIgc3RyaW5nRXNjYXBlcyA9IHtcbiAgJ1xcXFwnOiAnXFxcXCcsXG4gIFwiJ1wiOiBcIidcIixcbiAgJ1xcbic6ICduJyxcbiAgJ1xccic6ICdyJyxcbiAgJ1xcdCc6ICd0JyxcbiAgJ1xcdTIwMjgnOiAndTIwMjgnLFxuICAnXFx1MjAyOSc6ICd1MjAyOSdcbn07XG5cbi8qKlxuICogVXNlZCBieSBgdGVtcGxhdGVgIHRvIGVzY2FwZSBjaGFyYWN0ZXJzIGZvciBpbmNsdXNpb24gaW4gY29tcGlsZWRcbiAqIHN0cmluZyBsaXRlcmFscy5cbiAqXG4gKiBAcHJpdmF0ZVxuICogQHBhcmFtIHtzdHJpbmd9IG1hdGNoIFRoZSBtYXRjaGVkIGNoYXJhY3RlciB0byBlc2NhcGUuXG4gKiBAcmV0dXJucyB7c3RyaW5nfSBSZXR1cm5zIHRoZSBlc2NhcGVkIGNoYXJhY3Rlci5cbiAqL1xuZnVuY3Rpb24gZXNjYXBlU3RyaW5nQ2hhcihtYXRjaCkge1xuICByZXR1cm4gJ1xcXFwnICsgc3RyaW5nRXNjYXBlc1ttYXRjaF07XG59XG5cbm1vZHVsZS5leHBvcnRzID0gZXNjYXBlU3RyaW5nQ2hhcjtcbiIsIi8qKlxuICogTG8tRGFzaCAyLjQuMSAoQ3VzdG9tIEJ1aWxkKSA8aHR0cDovL2xvZGFzaC5jb20vPlxuICogQnVpbGQ6IGBsb2Rhc2ggbW9kdWxhcml6ZSBtb2Rlcm4gZXhwb3J0cz1cIm5vZGVcIiAtbyAuL21vZGVybi9gXG4gKiBDb3B5cmlnaHQgMjAxMi0yMDEzIFRoZSBEb2pvIEZvdW5kYXRpb24gPGh0dHA6Ly9kb2pvZm91bmRhdGlvbi5vcmcvPlxuICogQmFzZWQgb24gVW5kZXJzY29yZS5qcyAxLjUuMiA8aHR0cDovL3VuZGVyc2NvcmVqcy5vcmcvTElDRU5TRT5cbiAqIENvcHlyaWdodCAyMDA5LTIwMTMgSmVyZW15IEFzaGtlbmFzLCBEb2N1bWVudENsb3VkIGFuZCBJbnZlc3RpZ2F0aXZlIFJlcG9ydGVycyAmIEVkaXRvcnNcbiAqIEF2YWlsYWJsZSB1bmRlciBNSVQgbGljZW5zZSA8aHR0cDovL2xvZGFzaC5jb20vbGljZW5zZT5cbiAqL1xudmFyIGFycmF5UG9vbCA9IHJlcXVpcmUoJy4vYXJyYXlQb29sJyk7XG5cbi8qKlxuICogR2V0cyBhbiBhcnJheSBmcm9tIHRoZSBhcnJheSBwb29sIG9yIGNyZWF0ZXMgYSBuZXcgb25lIGlmIHRoZSBwb29sIGlzIGVtcHR5LlxuICpcbiAqIEBwcml2YXRlXG4gKiBAcmV0dXJucyB7QXJyYXl9IFRoZSBhcnJheSBmcm9tIHRoZSBwb29sLlxuICovXG5mdW5jdGlvbiBnZXRBcnJheSgpIHtcbiAgcmV0dXJuIGFycmF5UG9vbC5wb3AoKSB8fCBbXTtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBnZXRBcnJheTtcbiIsIi8qKlxuICogTG8tRGFzaCAyLjQuMSAoQ3VzdG9tIEJ1aWxkKSA8aHR0cDovL2xvZGFzaC5jb20vPlxuICogQnVpbGQ6IGBsb2Rhc2ggbW9kdWxhcml6ZSBtb2Rlcm4gZXhwb3J0cz1cIm5vZGVcIiAtbyAuL21vZGVybi9gXG4gKiBDb3B5cmlnaHQgMjAxMi0yMDEzIFRoZSBEb2pvIEZvdW5kYXRpb24gPGh0dHA6Ly9kb2pvZm91bmRhdGlvbi5vcmcvPlxuICogQmFzZWQgb24gVW5kZXJzY29yZS5qcyAxLjUuMiA8aHR0cDovL3VuZGVyc2NvcmVqcy5vcmcvTElDRU5TRT5cbiAqIENvcHlyaWdodCAyMDA5LTIwMTMgSmVyZW15IEFzaGtlbmFzLCBEb2N1bWVudENsb3VkIGFuZCBJbnZlc3RpZ2F0aXZlIFJlcG9ydGVycyAmIEVkaXRvcnNcbiAqIEF2YWlsYWJsZSB1bmRlciBNSVQgbGljZW5zZSA8aHR0cDovL2xvZGFzaC5jb20vbGljZW5zZT5cbiAqL1xudmFyIG9iamVjdFBvb2wgPSByZXF1aXJlKCcuL29iamVjdFBvb2wnKTtcblxuLyoqXG4gKiBHZXRzIGFuIG9iamVjdCBmcm9tIHRoZSBvYmplY3QgcG9vbCBvciBjcmVhdGVzIGEgbmV3IG9uZSBpZiB0aGUgcG9vbCBpcyBlbXB0eS5cbiAqXG4gKiBAcHJpdmF0ZVxuICogQHJldHVybnMge09iamVjdH0gVGhlIG9iamVjdCBmcm9tIHRoZSBwb29sLlxuICovXG5mdW5jdGlvbiBnZXRPYmplY3QoKSB7XG4gIHJldHVybiBvYmplY3RQb29sLnBvcCgpIHx8IHtcbiAgICAnYXJyYXknOiBudWxsLFxuICAgICdjYWNoZSc6IG51bGwsXG4gICAgJ2NyaXRlcmlhJzogbnVsbCxcbiAgICAnZmFsc2UnOiBmYWxzZSxcbiAgICAnaW5kZXgnOiAwLFxuICAgICdudWxsJzogZmFsc2UsXG4gICAgJ251bWJlcic6IG51bGwsXG4gICAgJ29iamVjdCc6IG51bGwsXG4gICAgJ3B1c2gnOiBudWxsLFxuICAgICdzdHJpbmcnOiBudWxsLFxuICAgICd0cnVlJzogZmFsc2UsXG4gICAgJ3VuZGVmaW5lZCc6IGZhbHNlLFxuICAgICd2YWx1ZSc6IG51bGxcbiAgfTtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBnZXRPYmplY3Q7XG4iLCIvKipcbiAqIExvLURhc2ggMi40LjEgKEN1c3RvbSBCdWlsZCkgPGh0dHA6Ly9sb2Rhc2guY29tLz5cbiAqIEJ1aWxkOiBgbG9kYXNoIG1vZHVsYXJpemUgbW9kZXJuIGV4cG9ydHM9XCJub2RlXCIgLW8gLi9tb2Rlcm4vYFxuICogQ29weXJpZ2h0IDIwMTItMjAxMyBUaGUgRG9qbyBGb3VuZGF0aW9uIDxodHRwOi8vZG9qb2ZvdW5kYXRpb24ub3JnLz5cbiAqIEJhc2VkIG9uIFVuZGVyc2NvcmUuanMgMS41LjIgPGh0dHA6Ly91bmRlcnNjb3JlanMub3JnL0xJQ0VOU0U+XG4gKiBDb3B5cmlnaHQgMjAwOS0yMDEzIEplcmVteSBBc2hrZW5hcywgRG9jdW1lbnRDbG91ZCBhbmQgSW52ZXN0aWdhdGl2ZSBSZXBvcnRlcnMgJiBFZGl0b3JzXG4gKiBBdmFpbGFibGUgdW5kZXIgTUlUIGxpY2Vuc2UgPGh0dHA6Ly9sb2Rhc2guY29tL2xpY2Vuc2U+XG4gKi9cblxuLyoqXG4gKiBVc2VkIHRvIGNvbnZlcnQgY2hhcmFjdGVycyB0byBIVE1MIGVudGl0aWVzOlxuICpcbiAqIFRob3VnaCB0aGUgYD5gIGNoYXJhY3RlciBpcyBlc2NhcGVkIGZvciBzeW1tZXRyeSwgY2hhcmFjdGVycyBsaWtlIGA+YCBhbmQgYC9gXG4gKiBkb24ndCByZXF1aXJlIGVzY2FwaW5nIGluIEhUTUwgYW5kIGhhdmUgbm8gc3BlY2lhbCBtZWFuaW5nIHVubGVzcyB0aGV5J3JlIHBhcnRcbiAqIG9mIGEgdGFnIG9yIGFuIHVucXVvdGVkIGF0dHJpYnV0ZSB2YWx1ZS5cbiAqIGh0dHA6Ly9tYXRoaWFzYnluZW5zLmJlL25vdGVzL2FtYmlndW91cy1hbXBlcnNhbmRzICh1bmRlciBcInNlbWktcmVsYXRlZCBmdW4gZmFjdFwiKVxuICovXG52YXIgaHRtbEVzY2FwZXMgPSB7XG4gICcmJzogJyZhbXA7JyxcbiAgJzwnOiAnJmx0OycsXG4gICc+JzogJyZndDsnLFxuICAnXCInOiAnJnF1b3Q7JyxcbiAgXCInXCI6ICcmIzM5Oydcbn07XG5cbm1vZHVsZS5leHBvcnRzID0gaHRtbEVzY2FwZXM7XG4iLCIvKipcbiAqIExvLURhc2ggMi40LjEgKEN1c3RvbSBCdWlsZCkgPGh0dHA6Ly9sb2Rhc2guY29tLz5cbiAqIEJ1aWxkOiBgbG9kYXNoIG1vZHVsYXJpemUgbW9kZXJuIGV4cG9ydHM9XCJub2RlXCIgLW8gLi9tb2Rlcm4vYFxuICogQ29weXJpZ2h0IDIwMTItMjAxMyBUaGUgRG9qbyBGb3VuZGF0aW9uIDxodHRwOi8vZG9qb2ZvdW5kYXRpb24ub3JnLz5cbiAqIEJhc2VkIG9uIFVuZGVyc2NvcmUuanMgMS41LjIgPGh0dHA6Ly91bmRlcnNjb3JlanMub3JnL0xJQ0VOU0U+XG4gKiBDb3B5cmlnaHQgMjAwOS0yMDEzIEplcmVteSBBc2hrZW5hcywgRG9jdW1lbnRDbG91ZCBhbmQgSW52ZXN0aWdhdGl2ZSBSZXBvcnRlcnMgJiBFZGl0b3JzXG4gKiBBdmFpbGFibGUgdW5kZXIgTUlUIGxpY2Vuc2UgPGh0dHA6Ly9sb2Rhc2guY29tL2xpY2Vuc2U+XG4gKi9cblxuLyoqIFVzZWQgZm9yIG5hdGl2ZSBtZXRob2QgcmVmZXJlbmNlcyAqL1xudmFyIG9iamVjdFByb3RvID0gT2JqZWN0LnByb3RvdHlwZTtcblxuLyoqIFVzZWQgdG8gcmVzb2x2ZSB0aGUgaW50ZXJuYWwgW1tDbGFzc11dIG9mIHZhbHVlcyAqL1xudmFyIHRvU3RyaW5nID0gb2JqZWN0UHJvdG8udG9TdHJpbmc7XG5cbi8qKiBVc2VkIHRvIGRldGVjdCBpZiBhIG1ldGhvZCBpcyBuYXRpdmUgKi9cbnZhciByZU5hdGl2ZSA9IFJlZ0V4cCgnXicgK1xuICBTdHJpbmcodG9TdHJpbmcpXG4gICAgLnJlcGxhY2UoL1suKis/XiR7fSgpfFtcXF1cXFxcXS9nLCAnXFxcXCQmJylcbiAgICAucmVwbGFjZSgvdG9TdHJpbmd8IGZvciBbXlxcXV0rL2csICcuKj8nKSArICckJ1xuKTtcblxuLyoqXG4gKiBDaGVja3MgaWYgYHZhbHVlYCBpcyBhIG5hdGl2ZSBmdW5jdGlvbi5cbiAqXG4gKiBAcHJpdmF0ZVxuICogQHBhcmFtIHsqfSB2YWx1ZSBUaGUgdmFsdWUgdG8gY2hlY2suXG4gKiBAcmV0dXJucyB7Ym9vbGVhbn0gUmV0dXJucyBgdHJ1ZWAgaWYgdGhlIGB2YWx1ZWAgaXMgYSBuYXRpdmUgZnVuY3Rpb24sIGVsc2UgYGZhbHNlYC5cbiAqL1xuZnVuY3Rpb24gaXNOYXRpdmUodmFsdWUpIHtcbiAgcmV0dXJuIHR5cGVvZiB2YWx1ZSA9PSAnZnVuY3Rpb24nICYmIHJlTmF0aXZlLnRlc3QodmFsdWUpO1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IGlzTmF0aXZlO1xuIiwiLyoqXG4gKiBMby1EYXNoIDIuNC4xIChDdXN0b20gQnVpbGQpIDxodHRwOi8vbG9kYXNoLmNvbS8+XG4gKiBCdWlsZDogYGxvZGFzaCBtb2R1bGFyaXplIG1vZGVybiBleHBvcnRzPVwibm9kZVwiIC1vIC4vbW9kZXJuL2BcbiAqIENvcHlyaWdodCAyMDEyLTIwMTMgVGhlIERvam8gRm91bmRhdGlvbiA8aHR0cDovL2Rvam9mb3VuZGF0aW9uLm9yZy8+XG4gKiBCYXNlZCBvbiBVbmRlcnNjb3JlLmpzIDEuNS4yIDxodHRwOi8vdW5kZXJzY29yZWpzLm9yZy9MSUNFTlNFPlxuICogQ29weXJpZ2h0IDIwMDktMjAxMyBKZXJlbXkgQXNoa2VuYXMsIERvY3VtZW50Q2xvdWQgYW5kIEludmVzdGlnYXRpdmUgUmVwb3J0ZXJzICYgRWRpdG9yc1xuICogQXZhaWxhYmxlIHVuZGVyIE1JVCBsaWNlbnNlIDxodHRwOi8vbG9kYXNoLmNvbS9saWNlbnNlPlxuICovXG5cbi8qKiBVc2VkIHRvIHByZWZpeCBrZXlzIHRvIGF2b2lkIGlzc3VlcyB3aXRoIGBfX3Byb3RvX19gIGFuZCBwcm9wZXJ0aWVzIG9uIGBPYmplY3QucHJvdG90eXBlYCAqL1xudmFyIGtleVByZWZpeCA9ICtuZXcgRGF0ZSArICcnO1xuXG5tb2R1bGUuZXhwb3J0cyA9IGtleVByZWZpeDtcbiIsIi8qKlxuICogTG8tRGFzaCAyLjQuMSAoQ3VzdG9tIEJ1aWxkKSA8aHR0cDovL2xvZGFzaC5jb20vPlxuICogQnVpbGQ6IGBsb2Rhc2ggbW9kdWxhcml6ZSBtb2Rlcm4gZXhwb3J0cz1cIm5vZGVcIiAtbyAuL21vZGVybi9gXG4gKiBDb3B5cmlnaHQgMjAxMi0yMDEzIFRoZSBEb2pvIEZvdW5kYXRpb24gPGh0dHA6Ly9kb2pvZm91bmRhdGlvbi5vcmcvPlxuICogQmFzZWQgb24gVW5kZXJzY29yZS5qcyAxLjUuMiA8aHR0cDovL3VuZGVyc2NvcmVqcy5vcmcvTElDRU5TRT5cbiAqIENvcHlyaWdodCAyMDA5LTIwMTMgSmVyZW15IEFzaGtlbmFzLCBEb2N1bWVudENsb3VkIGFuZCBJbnZlc3RpZ2F0aXZlIFJlcG9ydGVycyAmIEVkaXRvcnNcbiAqIEF2YWlsYWJsZSB1bmRlciBNSVQgbGljZW5zZSA8aHR0cDovL2xvZGFzaC5jb20vbGljZW5zZT5cbiAqL1xuXG4vKiogVXNlZCBhcyB0aGUgc2l6ZSB3aGVuIG9wdGltaXphdGlvbnMgYXJlIGVuYWJsZWQgZm9yIGxhcmdlIGFycmF5cyAqL1xudmFyIGxhcmdlQXJyYXlTaXplID0gNzU7XG5cbm1vZHVsZS5leHBvcnRzID0gbGFyZ2VBcnJheVNpemU7XG4iLCIvKipcbiAqIExvLURhc2ggMi40LjEgKEN1c3RvbSBCdWlsZCkgPGh0dHA6Ly9sb2Rhc2guY29tLz5cbiAqIEJ1aWxkOiBgbG9kYXNoIG1vZHVsYXJpemUgbW9kZXJuIGV4cG9ydHM9XCJub2RlXCIgLW8gLi9tb2Rlcm4vYFxuICogQ29weXJpZ2h0IDIwMTItMjAxMyBUaGUgRG9qbyBGb3VuZGF0aW9uIDxodHRwOi8vZG9qb2ZvdW5kYXRpb24ub3JnLz5cbiAqIEJhc2VkIG9uIFVuZGVyc2NvcmUuanMgMS41LjIgPGh0dHA6Ly91bmRlcnNjb3JlanMub3JnL0xJQ0VOU0U+XG4gKiBDb3B5cmlnaHQgMjAwOS0yMDEzIEplcmVteSBBc2hrZW5hcywgRG9jdW1lbnRDbG91ZCBhbmQgSW52ZXN0aWdhdGl2ZSBSZXBvcnRlcnMgJiBFZGl0b3JzXG4gKiBBdmFpbGFibGUgdW5kZXIgTUlUIGxpY2Vuc2UgPGh0dHA6Ly9sb2Rhc2guY29tL2xpY2Vuc2U+XG4gKi9cblxuLyoqIFVzZWQgYXMgdGhlIG1heCBzaXplIG9mIHRoZSBgYXJyYXlQb29sYCBhbmQgYG9iamVjdFBvb2xgICovXG52YXIgbWF4UG9vbFNpemUgPSA0MDtcblxubW9kdWxlLmV4cG9ydHMgPSBtYXhQb29sU2l6ZTtcbiIsIi8qKlxuICogTG8tRGFzaCAyLjQuMSAoQ3VzdG9tIEJ1aWxkKSA8aHR0cDovL2xvZGFzaC5jb20vPlxuICogQnVpbGQ6IGBsb2Rhc2ggbW9kdWxhcml6ZSBtb2Rlcm4gZXhwb3J0cz1cIm5vZGVcIiAtbyAuL21vZGVybi9gXG4gKiBDb3B5cmlnaHQgMjAxMi0yMDEzIFRoZSBEb2pvIEZvdW5kYXRpb24gPGh0dHA6Ly9kb2pvZm91bmRhdGlvbi5vcmcvPlxuICogQmFzZWQgb24gVW5kZXJzY29yZS5qcyAxLjUuMiA8aHR0cDovL3VuZGVyc2NvcmVqcy5vcmcvTElDRU5TRT5cbiAqIENvcHlyaWdodCAyMDA5LTIwMTMgSmVyZW15IEFzaGtlbmFzLCBEb2N1bWVudENsb3VkIGFuZCBJbnZlc3RpZ2F0aXZlIFJlcG9ydGVycyAmIEVkaXRvcnNcbiAqIEF2YWlsYWJsZSB1bmRlciBNSVQgbGljZW5zZSA8aHR0cDovL2xvZGFzaC5jb20vbGljZW5zZT5cbiAqL1xuXG4vKiogVXNlZCB0byBwb29sIGFycmF5cyBhbmQgb2JqZWN0cyB1c2VkIGludGVybmFsbHkgKi9cbnZhciBvYmplY3RQb29sID0gW107XG5cbm1vZHVsZS5leHBvcnRzID0gb2JqZWN0UG9vbDtcbiIsIi8qKlxuICogTG8tRGFzaCAyLjQuMSAoQ3VzdG9tIEJ1aWxkKSA8aHR0cDovL2xvZGFzaC5jb20vPlxuICogQnVpbGQ6IGBsb2Rhc2ggbW9kdWxhcml6ZSBtb2Rlcm4gZXhwb3J0cz1cIm5vZGVcIiAtbyAuL21vZGVybi9gXG4gKiBDb3B5cmlnaHQgMjAxMi0yMDEzIFRoZSBEb2pvIEZvdW5kYXRpb24gPGh0dHA6Ly9kb2pvZm91bmRhdGlvbi5vcmcvPlxuICogQmFzZWQgb24gVW5kZXJzY29yZS5qcyAxLjUuMiA8aHR0cDovL3VuZGVyc2NvcmVqcy5vcmcvTElDRU5TRT5cbiAqIENvcHlyaWdodCAyMDA5LTIwMTMgSmVyZW15IEFzaGtlbmFzLCBEb2N1bWVudENsb3VkIGFuZCBJbnZlc3RpZ2F0aXZlIFJlcG9ydGVycyAmIEVkaXRvcnNcbiAqIEF2YWlsYWJsZSB1bmRlciBNSVQgbGljZW5zZSA8aHR0cDovL2xvZGFzaC5jb20vbGljZW5zZT5cbiAqL1xuXG4vKiogVXNlZCB0byBkZXRlcm1pbmUgaWYgdmFsdWVzIGFyZSBvZiB0aGUgbGFuZ3VhZ2UgdHlwZSBPYmplY3QgKi9cbnZhciBvYmplY3RUeXBlcyA9IHtcbiAgJ2Jvb2xlYW4nOiBmYWxzZSxcbiAgJ2Z1bmN0aW9uJzogdHJ1ZSxcbiAgJ29iamVjdCc6IHRydWUsXG4gICdudW1iZXInOiBmYWxzZSxcbiAgJ3N0cmluZyc6IGZhbHNlLFxuICAndW5kZWZpbmVkJzogZmFsc2Vcbn07XG5cbm1vZHVsZS5leHBvcnRzID0gb2JqZWN0VHlwZXM7XG4iLCIvKipcbiAqIExvLURhc2ggMi40LjEgKEN1c3RvbSBCdWlsZCkgPGh0dHA6Ly9sb2Rhc2guY29tLz5cbiAqIEJ1aWxkOiBgbG9kYXNoIG1vZHVsYXJpemUgbW9kZXJuIGV4cG9ydHM9XCJub2RlXCIgLW8gLi9tb2Rlcm4vYFxuICogQ29weXJpZ2h0IDIwMTItMjAxMyBUaGUgRG9qbyBGb3VuZGF0aW9uIDxodHRwOi8vZG9qb2ZvdW5kYXRpb24ub3JnLz5cbiAqIEJhc2VkIG9uIFVuZGVyc2NvcmUuanMgMS41LjIgPGh0dHA6Ly91bmRlcnNjb3JlanMub3JnL0xJQ0VOU0U+XG4gKiBDb3B5cmlnaHQgMjAwOS0yMDEzIEplcmVteSBBc2hrZW5hcywgRG9jdW1lbnRDbG91ZCBhbmQgSW52ZXN0aWdhdGl2ZSBSZXBvcnRlcnMgJiBFZGl0b3JzXG4gKiBBdmFpbGFibGUgdW5kZXIgTUlUIGxpY2Vuc2UgPGh0dHA6Ly9sb2Rhc2guY29tL2xpY2Vuc2U+XG4gKi9cblxuLyoqIFVzZWQgdG8gbWF0Y2ggXCJpbnRlcnBvbGF0ZVwiIHRlbXBsYXRlIGRlbGltaXRlcnMgKi9cbnZhciByZUludGVycG9sYXRlID0gLzwlPShbXFxzXFxTXSs/KSU+L2c7XG5cbm1vZHVsZS5leHBvcnRzID0gcmVJbnRlcnBvbGF0ZTtcbiIsIi8qKlxuICogTG8tRGFzaCAyLjQuMSAoQ3VzdG9tIEJ1aWxkKSA8aHR0cDovL2xvZGFzaC5jb20vPlxuICogQnVpbGQ6IGBsb2Rhc2ggbW9kdWxhcml6ZSBtb2Rlcm4gZXhwb3J0cz1cIm5vZGVcIiAtbyAuL21vZGVybi9gXG4gKiBDb3B5cmlnaHQgMjAxMi0yMDEzIFRoZSBEb2pvIEZvdW5kYXRpb24gPGh0dHA6Ly9kb2pvZm91bmRhdGlvbi5vcmcvPlxuICogQmFzZWQgb24gVW5kZXJzY29yZS5qcyAxLjUuMiA8aHR0cDovL3VuZGVyc2NvcmVqcy5vcmcvTElDRU5TRT5cbiAqIENvcHlyaWdodCAyMDA5LTIwMTMgSmVyZW15IEFzaGtlbmFzLCBEb2N1bWVudENsb3VkIGFuZCBJbnZlc3RpZ2F0aXZlIFJlcG9ydGVycyAmIEVkaXRvcnNcbiAqIEF2YWlsYWJsZSB1bmRlciBNSVQgbGljZW5zZSA8aHR0cDovL2xvZGFzaC5jb20vbGljZW5zZT5cbiAqL1xudmFyIGh0bWxFc2NhcGVzID0gcmVxdWlyZSgnLi9odG1sRXNjYXBlcycpLFxuICAgIGtleXMgPSByZXF1aXJlKCcuLi9vYmplY3RzL2tleXMnKTtcblxuLyoqIFVzZWQgdG8gbWF0Y2ggSFRNTCBlbnRpdGllcyBhbmQgSFRNTCBjaGFyYWN0ZXJzICovXG52YXIgcmVVbmVzY2FwZWRIdG1sID0gUmVnRXhwKCdbJyArIGtleXMoaHRtbEVzY2FwZXMpLmpvaW4oJycpICsgJ10nLCAnZycpO1xuXG5tb2R1bGUuZXhwb3J0cyA9IHJlVW5lc2NhcGVkSHRtbDtcbiIsIi8qKlxuICogTG8tRGFzaCAyLjQuMSAoQ3VzdG9tIEJ1aWxkKSA8aHR0cDovL2xvZGFzaC5jb20vPlxuICogQnVpbGQ6IGBsb2Rhc2ggbW9kdWxhcml6ZSBtb2Rlcm4gZXhwb3J0cz1cIm5vZGVcIiAtbyAuL21vZGVybi9gXG4gKiBDb3B5cmlnaHQgMjAxMi0yMDEzIFRoZSBEb2pvIEZvdW5kYXRpb24gPGh0dHA6Ly9kb2pvZm91bmRhdGlvbi5vcmcvPlxuICogQmFzZWQgb24gVW5kZXJzY29yZS5qcyAxLjUuMiA8aHR0cDovL3VuZGVyc2NvcmVqcy5vcmcvTElDRU5TRT5cbiAqIENvcHlyaWdodCAyMDA5LTIwMTMgSmVyZW15IEFzaGtlbmFzLCBEb2N1bWVudENsb3VkIGFuZCBJbnZlc3RpZ2F0aXZlIFJlcG9ydGVycyAmIEVkaXRvcnNcbiAqIEF2YWlsYWJsZSB1bmRlciBNSVQgbGljZW5zZSA8aHR0cDovL2xvZGFzaC5jb20vbGljZW5zZT5cbiAqL1xudmFyIGFycmF5UG9vbCA9IHJlcXVpcmUoJy4vYXJyYXlQb29sJyksXG4gICAgbWF4UG9vbFNpemUgPSByZXF1aXJlKCcuL21heFBvb2xTaXplJyk7XG5cbi8qKlxuICogUmVsZWFzZXMgdGhlIGdpdmVuIGFycmF5IGJhY2sgdG8gdGhlIGFycmF5IHBvb2wuXG4gKlxuICogQHByaXZhdGVcbiAqIEBwYXJhbSB7QXJyYXl9IFthcnJheV0gVGhlIGFycmF5IHRvIHJlbGVhc2UuXG4gKi9cbmZ1bmN0aW9uIHJlbGVhc2VBcnJheShhcnJheSkge1xuICBhcnJheS5sZW5ndGggPSAwO1xuICBpZiAoYXJyYXlQb29sLmxlbmd0aCA8IG1heFBvb2xTaXplKSB7XG4gICAgYXJyYXlQb29sLnB1c2goYXJyYXkpO1xuICB9XG59XG5cbm1vZHVsZS5leHBvcnRzID0gcmVsZWFzZUFycmF5O1xuIiwiLyoqXG4gKiBMby1EYXNoIDIuNC4xIChDdXN0b20gQnVpbGQpIDxodHRwOi8vbG9kYXNoLmNvbS8+XG4gKiBCdWlsZDogYGxvZGFzaCBtb2R1bGFyaXplIG1vZGVybiBleHBvcnRzPVwibm9kZVwiIC1vIC4vbW9kZXJuL2BcbiAqIENvcHlyaWdodCAyMDEyLTIwMTMgVGhlIERvam8gRm91bmRhdGlvbiA8aHR0cDovL2Rvam9mb3VuZGF0aW9uLm9yZy8+XG4gKiBCYXNlZCBvbiBVbmRlcnNjb3JlLmpzIDEuNS4yIDxodHRwOi8vdW5kZXJzY29yZWpzLm9yZy9MSUNFTlNFPlxuICogQ29weXJpZ2h0IDIwMDktMjAxMyBKZXJlbXkgQXNoa2VuYXMsIERvY3VtZW50Q2xvdWQgYW5kIEludmVzdGlnYXRpdmUgUmVwb3J0ZXJzICYgRWRpdG9yc1xuICogQXZhaWxhYmxlIHVuZGVyIE1JVCBsaWNlbnNlIDxodHRwOi8vbG9kYXNoLmNvbS9saWNlbnNlPlxuICovXG52YXIgbWF4UG9vbFNpemUgPSByZXF1aXJlKCcuL21heFBvb2xTaXplJyksXG4gICAgb2JqZWN0UG9vbCA9IHJlcXVpcmUoJy4vb2JqZWN0UG9vbCcpO1xuXG4vKipcbiAqIFJlbGVhc2VzIHRoZSBnaXZlbiBvYmplY3QgYmFjayB0byB0aGUgb2JqZWN0IHBvb2wuXG4gKlxuICogQHByaXZhdGVcbiAqIEBwYXJhbSB7T2JqZWN0fSBbb2JqZWN0XSBUaGUgb2JqZWN0IHRvIHJlbGVhc2UuXG4gKi9cbmZ1bmN0aW9uIHJlbGVhc2VPYmplY3Qob2JqZWN0KSB7XG4gIHZhciBjYWNoZSA9IG9iamVjdC5jYWNoZTtcbiAgaWYgKGNhY2hlKSB7XG4gICAgcmVsZWFzZU9iamVjdChjYWNoZSk7XG4gIH1cbiAgb2JqZWN0LmFycmF5ID0gb2JqZWN0LmNhY2hlID0gb2JqZWN0LmNyaXRlcmlhID0gb2JqZWN0Lm9iamVjdCA9IG9iamVjdC5udW1iZXIgPSBvYmplY3Quc3RyaW5nID0gb2JqZWN0LnZhbHVlID0gbnVsbDtcbiAgaWYgKG9iamVjdFBvb2wubGVuZ3RoIDwgbWF4UG9vbFNpemUpIHtcbiAgICBvYmplY3RQb29sLnB1c2gob2JqZWN0KTtcbiAgfVxufVxuXG5tb2R1bGUuZXhwb3J0cyA9IHJlbGVhc2VPYmplY3Q7XG4iLCIvKipcbiAqIExvLURhc2ggMi40LjEgKEN1c3RvbSBCdWlsZCkgPGh0dHA6Ly9sb2Rhc2guY29tLz5cbiAqIEJ1aWxkOiBgbG9kYXNoIG1vZHVsYXJpemUgbW9kZXJuIGV4cG9ydHM9XCJub2RlXCIgLW8gLi9tb2Rlcm4vYFxuICogQ29weXJpZ2h0IDIwMTItMjAxMyBUaGUgRG9qbyBGb3VuZGF0aW9uIDxodHRwOi8vZG9qb2ZvdW5kYXRpb24ub3JnLz5cbiAqIEJhc2VkIG9uIFVuZGVyc2NvcmUuanMgMS41LjIgPGh0dHA6Ly91bmRlcnNjb3JlanMub3JnL0xJQ0VOU0U+XG4gKiBDb3B5cmlnaHQgMjAwOS0yMDEzIEplcmVteSBBc2hrZW5hcywgRG9jdW1lbnRDbG91ZCBhbmQgSW52ZXN0aWdhdGl2ZSBSZXBvcnRlcnMgJiBFZGl0b3JzXG4gKiBBdmFpbGFibGUgdW5kZXIgTUlUIGxpY2Vuc2UgPGh0dHA6Ly9sb2Rhc2guY29tL2xpY2Vuc2U+XG4gKi9cbnZhciBpc05hdGl2ZSA9IHJlcXVpcmUoJy4vaXNOYXRpdmUnKSxcbiAgICBub29wID0gcmVxdWlyZSgnLi4vdXRpbGl0aWVzL25vb3AnKTtcblxuLyoqIFVzZWQgYXMgdGhlIHByb3BlcnR5IGRlc2NyaXB0b3IgZm9yIGBfX2JpbmREYXRhX19gICovXG52YXIgZGVzY3JpcHRvciA9IHtcbiAgJ2NvbmZpZ3VyYWJsZSc6IGZhbHNlLFxuICAnZW51bWVyYWJsZSc6IGZhbHNlLFxuICAndmFsdWUnOiBudWxsLFxuICAnd3JpdGFibGUnOiBmYWxzZVxufTtcblxuLyoqIFVzZWQgdG8gc2V0IG1ldGEgZGF0YSBvbiBmdW5jdGlvbnMgKi9cbnZhciBkZWZpbmVQcm9wZXJ0eSA9IChmdW5jdGlvbigpIHtcbiAgLy8gSUUgOCBvbmx5IGFjY2VwdHMgRE9NIGVsZW1lbnRzXG4gIHRyeSB7XG4gICAgdmFyIG8gPSB7fSxcbiAgICAgICAgZnVuYyA9IGlzTmF0aXZlKGZ1bmMgPSBPYmplY3QuZGVmaW5lUHJvcGVydHkpICYmIGZ1bmMsXG4gICAgICAgIHJlc3VsdCA9IGZ1bmMobywgbywgbykgJiYgZnVuYztcbiAgfSBjYXRjaChlKSB7IH1cbiAgcmV0dXJuIHJlc3VsdDtcbn0oKSk7XG5cbi8qKlxuICogU2V0cyBgdGhpc2AgYmluZGluZyBkYXRhIG9uIGEgZ2l2ZW4gZnVuY3Rpb24uXG4gKlxuICogQHByaXZhdGVcbiAqIEBwYXJhbSB7RnVuY3Rpb259IGZ1bmMgVGhlIGZ1bmN0aW9uIHRvIHNldCBkYXRhIG9uLlxuICogQHBhcmFtIHtBcnJheX0gdmFsdWUgVGhlIGRhdGEgYXJyYXkgdG8gc2V0LlxuICovXG52YXIgc2V0QmluZERhdGEgPSAhZGVmaW5lUHJvcGVydHkgPyBub29wIDogZnVuY3Rpb24oZnVuYywgdmFsdWUpIHtcbiAgZGVzY3JpcHRvci52YWx1ZSA9IHZhbHVlO1xuICBkZWZpbmVQcm9wZXJ0eShmdW5jLCAnX19iaW5kRGF0YV9fJywgZGVzY3JpcHRvcik7XG59O1xuXG5tb2R1bGUuZXhwb3J0cyA9IHNldEJpbmREYXRhO1xuIiwiLyoqXG4gKiBMby1EYXNoIDIuNC4xIChDdXN0b20gQnVpbGQpIDxodHRwOi8vbG9kYXNoLmNvbS8+XG4gKiBCdWlsZDogYGxvZGFzaCBtb2R1bGFyaXplIG1vZGVybiBleHBvcnRzPVwibm9kZVwiIC1vIC4vbW9kZXJuL2BcbiAqIENvcHlyaWdodCAyMDEyLTIwMTMgVGhlIERvam8gRm91bmRhdGlvbiA8aHR0cDovL2Rvam9mb3VuZGF0aW9uLm9yZy8+XG4gKiBCYXNlZCBvbiBVbmRlcnNjb3JlLmpzIDEuNS4yIDxodHRwOi8vdW5kZXJzY29yZWpzLm9yZy9MSUNFTlNFPlxuICogQ29weXJpZ2h0IDIwMDktMjAxMyBKZXJlbXkgQXNoa2VuYXMsIERvY3VtZW50Q2xvdWQgYW5kIEludmVzdGlnYXRpdmUgUmVwb3J0ZXJzICYgRWRpdG9yc1xuICogQXZhaWxhYmxlIHVuZGVyIE1JVCBsaWNlbnNlIDxodHRwOi8vbG9kYXNoLmNvbS9saWNlbnNlPlxuICovXG52YXIgb2JqZWN0VHlwZXMgPSByZXF1aXJlKCcuL29iamVjdFR5cGVzJyk7XG5cbi8qKiBVc2VkIGZvciBuYXRpdmUgbWV0aG9kIHJlZmVyZW5jZXMgKi9cbnZhciBvYmplY3RQcm90byA9IE9iamVjdC5wcm90b3R5cGU7XG5cbi8qKiBOYXRpdmUgbWV0aG9kIHNob3J0Y3V0cyAqL1xudmFyIGhhc093blByb3BlcnR5ID0gb2JqZWN0UHJvdG8uaGFzT3duUHJvcGVydHk7XG5cbi8qKlxuICogQSBmYWxsYmFjayBpbXBsZW1lbnRhdGlvbiBvZiBgT2JqZWN0LmtleXNgIHdoaWNoIHByb2R1Y2VzIGFuIGFycmF5IG9mIHRoZVxuICogZ2l2ZW4gb2JqZWN0J3Mgb3duIGVudW1lcmFibGUgcHJvcGVydHkgbmFtZXMuXG4gKlxuICogQHByaXZhdGVcbiAqIEB0eXBlIEZ1bmN0aW9uXG4gKiBAcGFyYW0ge09iamVjdH0gb2JqZWN0IFRoZSBvYmplY3QgdG8gaW5zcGVjdC5cbiAqIEByZXR1cm5zIHtBcnJheX0gUmV0dXJucyBhbiBhcnJheSBvZiBwcm9wZXJ0eSBuYW1lcy5cbiAqL1xudmFyIHNoaW1LZXlzID0gZnVuY3Rpb24ob2JqZWN0KSB7XG4gIHZhciBpbmRleCwgaXRlcmFibGUgPSBvYmplY3QsIHJlc3VsdCA9IFtdO1xuICBpZiAoIWl0ZXJhYmxlKSByZXR1cm4gcmVzdWx0O1xuICBpZiAoIShvYmplY3RUeXBlc1t0eXBlb2Ygb2JqZWN0XSkpIHJldHVybiByZXN1bHQ7XG4gICAgZm9yIChpbmRleCBpbiBpdGVyYWJsZSkge1xuICAgICAgaWYgKGhhc093blByb3BlcnR5LmNhbGwoaXRlcmFibGUsIGluZGV4KSkge1xuICAgICAgICByZXN1bHQucHVzaChpbmRleCk7XG4gICAgICB9XG4gICAgfVxuICByZXR1cm4gcmVzdWx0XG59O1xuXG5tb2R1bGUuZXhwb3J0cyA9IHNoaW1LZXlzO1xuIiwiLyoqXG4gKiBMby1EYXNoIDIuNC4xIChDdXN0b20gQnVpbGQpIDxodHRwOi8vbG9kYXNoLmNvbS8+XG4gKiBCdWlsZDogYGxvZGFzaCBtb2R1bGFyaXplIG1vZGVybiBleHBvcnRzPVwibm9kZVwiIC1vIC4vbW9kZXJuL2BcbiAqIENvcHlyaWdodCAyMDEyLTIwMTMgVGhlIERvam8gRm91bmRhdGlvbiA8aHR0cDovL2Rvam9mb3VuZGF0aW9uLm9yZy8+XG4gKiBCYXNlZCBvbiBVbmRlcnNjb3JlLmpzIDEuNS4yIDxodHRwOi8vdW5kZXJzY29yZWpzLm9yZy9MSUNFTlNFPlxuICogQ29weXJpZ2h0IDIwMDktMjAxMyBKZXJlbXkgQXNoa2VuYXMsIERvY3VtZW50Q2xvdWQgYW5kIEludmVzdGlnYXRpdmUgUmVwb3J0ZXJzICYgRWRpdG9yc1xuICogQXZhaWxhYmxlIHVuZGVyIE1JVCBsaWNlbnNlIDxodHRwOi8vbG9kYXNoLmNvbS9saWNlbnNlPlxuICovXG5cbi8qKlxuICogU2xpY2VzIHRoZSBgY29sbGVjdGlvbmAgZnJvbSB0aGUgYHN0YXJ0YCBpbmRleCB1cCB0bywgYnV0IG5vdCBpbmNsdWRpbmcsXG4gKiB0aGUgYGVuZGAgaW5kZXguXG4gKlxuICogTm90ZTogVGhpcyBmdW5jdGlvbiBpcyB1c2VkIGluc3RlYWQgb2YgYEFycmF5I3NsaWNlYCB0byBzdXBwb3J0IG5vZGUgbGlzdHNcbiAqIGluIElFIDwgOSBhbmQgdG8gZW5zdXJlIGRlbnNlIGFycmF5cyBhcmUgcmV0dXJuZWQuXG4gKlxuICogQHByaXZhdGVcbiAqIEBwYXJhbSB7QXJyYXl8T2JqZWN0fHN0cmluZ30gY29sbGVjdGlvbiBUaGUgY29sbGVjdGlvbiB0byBzbGljZS5cbiAqIEBwYXJhbSB7bnVtYmVyfSBzdGFydCBUaGUgc3RhcnQgaW5kZXguXG4gKiBAcGFyYW0ge251bWJlcn0gZW5kIFRoZSBlbmQgaW5kZXguXG4gKiBAcmV0dXJucyB7QXJyYXl9IFJldHVybnMgdGhlIG5ldyBhcnJheS5cbiAqL1xuZnVuY3Rpb24gc2xpY2UoYXJyYXksIHN0YXJ0LCBlbmQpIHtcbiAgc3RhcnQgfHwgKHN0YXJ0ID0gMCk7XG4gIGlmICh0eXBlb2YgZW5kID09ICd1bmRlZmluZWQnKSB7XG4gICAgZW5kID0gYXJyYXkgPyBhcnJheS5sZW5ndGggOiAwO1xuICB9XG4gIHZhciBpbmRleCA9IC0xLFxuICAgICAgbGVuZ3RoID0gZW5kIC0gc3RhcnQgfHwgMCxcbiAgICAgIHJlc3VsdCA9IEFycmF5KGxlbmd0aCA8IDAgPyAwIDogbGVuZ3RoKTtcblxuICB3aGlsZSAoKytpbmRleCA8IGxlbmd0aCkge1xuICAgIHJlc3VsdFtpbmRleF0gPSBhcnJheVtzdGFydCArIGluZGV4XTtcbiAgfVxuICByZXR1cm4gcmVzdWx0O1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IHNsaWNlO1xuIiwiLyoqXG4gKiBMby1EYXNoIDIuNC4xIChDdXN0b20gQnVpbGQpIDxodHRwOi8vbG9kYXNoLmNvbS8+XG4gKiBCdWlsZDogYGxvZGFzaCBtb2R1bGFyaXplIG1vZGVybiBleHBvcnRzPVwibm9kZVwiIC1vIC4vbW9kZXJuL2BcbiAqIENvcHlyaWdodCAyMDEyLTIwMTMgVGhlIERvam8gRm91bmRhdGlvbiA8aHR0cDovL2Rvam9mb3VuZGF0aW9uLm9yZy8+XG4gKiBCYXNlZCBvbiBVbmRlcnNjb3JlLmpzIDEuNS4yIDxodHRwOi8vdW5kZXJzY29yZWpzLm9yZy9MSUNFTlNFPlxuICogQ29weXJpZ2h0IDIwMDktMjAxMyBKZXJlbXkgQXNoa2VuYXMsIERvY3VtZW50Q2xvdWQgYW5kIEludmVzdGlnYXRpdmUgUmVwb3J0ZXJzICYgRWRpdG9yc1xuICogQXZhaWxhYmxlIHVuZGVyIE1JVCBsaWNlbnNlIDxodHRwOi8vbG9kYXNoLmNvbS9saWNlbnNlPlxuICovXG52YXIgYmFzZUNyZWF0ZUNhbGxiYWNrID0gcmVxdWlyZSgnLi4vaW50ZXJuYWxzL2Jhc2VDcmVhdGVDYWxsYmFjaycpLFxuICAgIGtleXMgPSByZXF1aXJlKCcuL2tleXMnKSxcbiAgICBvYmplY3RUeXBlcyA9IHJlcXVpcmUoJy4uL2ludGVybmFscy9vYmplY3RUeXBlcycpO1xuXG4vKipcbiAqIEFzc2lnbnMgb3duIGVudW1lcmFibGUgcHJvcGVydGllcyBvZiBzb3VyY2Ugb2JqZWN0KHMpIHRvIHRoZSBkZXN0aW5hdGlvblxuICogb2JqZWN0LiBTdWJzZXF1ZW50IHNvdXJjZXMgd2lsbCBvdmVyd3JpdGUgcHJvcGVydHkgYXNzaWdubWVudHMgb2YgcHJldmlvdXNcbiAqIHNvdXJjZXMuIElmIGEgY2FsbGJhY2sgaXMgcHJvdmlkZWQgaXQgd2lsbCBiZSBleGVjdXRlZCB0byBwcm9kdWNlIHRoZVxuICogYXNzaWduZWQgdmFsdWVzLiBUaGUgY2FsbGJhY2sgaXMgYm91bmQgdG8gYHRoaXNBcmdgIGFuZCBpbnZva2VkIHdpdGggdHdvXG4gKiBhcmd1bWVudHM7IChvYmplY3RWYWx1ZSwgc291cmNlVmFsdWUpLlxuICpcbiAqIEBzdGF0aWNcbiAqIEBtZW1iZXJPZiBfXG4gKiBAdHlwZSBGdW5jdGlvblxuICogQGFsaWFzIGV4dGVuZFxuICogQGNhdGVnb3J5IE9iamVjdHNcbiAqIEBwYXJhbSB7T2JqZWN0fSBvYmplY3QgVGhlIGRlc3RpbmF0aW9uIG9iamVjdC5cbiAqIEBwYXJhbSB7Li4uT2JqZWN0fSBbc291cmNlXSBUaGUgc291cmNlIG9iamVjdHMuXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBbY2FsbGJhY2tdIFRoZSBmdW5jdGlvbiB0byBjdXN0b21pemUgYXNzaWduaW5nIHZhbHVlcy5cbiAqIEBwYXJhbSB7Kn0gW3RoaXNBcmddIFRoZSBgdGhpc2AgYmluZGluZyBvZiBgY2FsbGJhY2tgLlxuICogQHJldHVybnMge09iamVjdH0gUmV0dXJucyB0aGUgZGVzdGluYXRpb24gb2JqZWN0LlxuICogQGV4YW1wbGVcbiAqXG4gKiBfLmFzc2lnbih7ICduYW1lJzogJ2ZyZWQnIH0sIHsgJ2VtcGxveWVyJzogJ3NsYXRlJyB9KTtcbiAqIC8vID0+IHsgJ25hbWUnOiAnZnJlZCcsICdlbXBsb3llcic6ICdzbGF0ZScgfVxuICpcbiAqIHZhciBkZWZhdWx0cyA9IF8ucGFydGlhbFJpZ2h0KF8uYXNzaWduLCBmdW5jdGlvbihhLCBiKSB7XG4gKiAgIHJldHVybiB0eXBlb2YgYSA9PSAndW5kZWZpbmVkJyA/IGIgOiBhO1xuICogfSk7XG4gKlxuICogdmFyIG9iamVjdCA9IHsgJ25hbWUnOiAnYmFybmV5JyB9O1xuICogZGVmYXVsdHMob2JqZWN0LCB7ICduYW1lJzogJ2ZyZWQnLCAnZW1wbG95ZXInOiAnc2xhdGUnIH0pO1xuICogLy8gPT4geyAnbmFtZSc6ICdiYXJuZXknLCAnZW1wbG95ZXInOiAnc2xhdGUnIH1cbiAqL1xudmFyIGFzc2lnbiA9IGZ1bmN0aW9uKG9iamVjdCwgc291cmNlLCBndWFyZCkge1xuICB2YXIgaW5kZXgsIGl0ZXJhYmxlID0gb2JqZWN0LCByZXN1bHQgPSBpdGVyYWJsZTtcbiAgaWYgKCFpdGVyYWJsZSkgcmV0dXJuIHJlc3VsdDtcbiAgdmFyIGFyZ3MgPSBhcmd1bWVudHMsXG4gICAgICBhcmdzSW5kZXggPSAwLFxuICAgICAgYXJnc0xlbmd0aCA9IHR5cGVvZiBndWFyZCA9PSAnbnVtYmVyJyA/IDIgOiBhcmdzLmxlbmd0aDtcbiAgaWYgKGFyZ3NMZW5ndGggPiAzICYmIHR5cGVvZiBhcmdzW2FyZ3NMZW5ndGggLSAyXSA9PSAnZnVuY3Rpb24nKSB7XG4gICAgdmFyIGNhbGxiYWNrID0gYmFzZUNyZWF0ZUNhbGxiYWNrKGFyZ3NbLS1hcmdzTGVuZ3RoIC0gMV0sIGFyZ3NbYXJnc0xlbmd0aC0tXSwgMik7XG4gIH0gZWxzZSBpZiAoYXJnc0xlbmd0aCA+IDIgJiYgdHlwZW9mIGFyZ3NbYXJnc0xlbmd0aCAtIDFdID09ICdmdW5jdGlvbicpIHtcbiAgICBjYWxsYmFjayA9IGFyZ3NbLS1hcmdzTGVuZ3RoXTtcbiAgfVxuICB3aGlsZSAoKythcmdzSW5kZXggPCBhcmdzTGVuZ3RoKSB7XG4gICAgaXRlcmFibGUgPSBhcmdzW2FyZ3NJbmRleF07XG4gICAgaWYgKGl0ZXJhYmxlICYmIG9iamVjdFR5cGVzW3R5cGVvZiBpdGVyYWJsZV0pIHtcbiAgICB2YXIgb3duSW5kZXggPSAtMSxcbiAgICAgICAgb3duUHJvcHMgPSBvYmplY3RUeXBlc1t0eXBlb2YgaXRlcmFibGVdICYmIGtleXMoaXRlcmFibGUpLFxuICAgICAgICBsZW5ndGggPSBvd25Qcm9wcyA/IG93blByb3BzLmxlbmd0aCA6IDA7XG5cbiAgICB3aGlsZSAoKytvd25JbmRleCA8IGxlbmd0aCkge1xuICAgICAgaW5kZXggPSBvd25Qcm9wc1tvd25JbmRleF07XG4gICAgICByZXN1bHRbaW5kZXhdID0gY2FsbGJhY2sgPyBjYWxsYmFjayhyZXN1bHRbaW5kZXhdLCBpdGVyYWJsZVtpbmRleF0pIDogaXRlcmFibGVbaW5kZXhdO1xuICAgIH1cbiAgICB9XG4gIH1cbiAgcmV0dXJuIHJlc3VsdFxufTtcblxubW9kdWxlLmV4cG9ydHMgPSBhc3NpZ247XG4iLCIvKipcbiAqIExvLURhc2ggMi40LjEgKEN1c3RvbSBCdWlsZCkgPGh0dHA6Ly9sb2Rhc2guY29tLz5cbiAqIEJ1aWxkOiBgbG9kYXNoIG1vZHVsYXJpemUgbW9kZXJuIGV4cG9ydHM9XCJub2RlXCIgLW8gLi9tb2Rlcm4vYFxuICogQ29weXJpZ2h0IDIwMTItMjAxMyBUaGUgRG9qbyBGb3VuZGF0aW9uIDxodHRwOi8vZG9qb2ZvdW5kYXRpb24ub3JnLz5cbiAqIEJhc2VkIG9uIFVuZGVyc2NvcmUuanMgMS41LjIgPGh0dHA6Ly91bmRlcnNjb3JlanMub3JnL0xJQ0VOU0U+XG4gKiBDb3B5cmlnaHQgMjAwOS0yMDEzIEplcmVteSBBc2hrZW5hcywgRG9jdW1lbnRDbG91ZCBhbmQgSW52ZXN0aWdhdGl2ZSBSZXBvcnRlcnMgJiBFZGl0b3JzXG4gKiBBdmFpbGFibGUgdW5kZXIgTUlUIGxpY2Vuc2UgPGh0dHA6Ly9sb2Rhc2guY29tL2xpY2Vuc2U+XG4gKi9cbnZhciBhc3NpZ24gPSByZXF1aXJlKCcuL2Fzc2lnbicpLFxuICAgIGJhc2VDcmVhdGUgPSByZXF1aXJlKCcuLi9pbnRlcm5hbHMvYmFzZUNyZWF0ZScpO1xuXG4vKipcbiAqIENyZWF0ZXMgYW4gb2JqZWN0IHRoYXQgaW5oZXJpdHMgZnJvbSB0aGUgZ2l2ZW4gYHByb3RvdHlwZWAgb2JqZWN0LiBJZiBhXG4gKiBgcHJvcGVydGllc2Agb2JqZWN0IGlzIHByb3ZpZGVkIGl0cyBvd24gZW51bWVyYWJsZSBwcm9wZXJ0aWVzIGFyZSBhc3NpZ25lZFxuICogdG8gdGhlIGNyZWF0ZWQgb2JqZWN0LlxuICpcbiAqIEBzdGF0aWNcbiAqIEBtZW1iZXJPZiBfXG4gKiBAY2F0ZWdvcnkgT2JqZWN0c1xuICogQHBhcmFtIHtPYmplY3R9IHByb3RvdHlwZSBUaGUgb2JqZWN0IHRvIGluaGVyaXQgZnJvbS5cbiAqIEBwYXJhbSB7T2JqZWN0fSBbcHJvcGVydGllc10gVGhlIHByb3BlcnRpZXMgdG8gYXNzaWduIHRvIHRoZSBvYmplY3QuXG4gKiBAcmV0dXJucyB7T2JqZWN0fSBSZXR1cm5zIHRoZSBuZXcgb2JqZWN0LlxuICogQGV4YW1wbGVcbiAqXG4gKiBmdW5jdGlvbiBTaGFwZSgpIHtcbiAqICAgdGhpcy54ID0gMDtcbiAqICAgdGhpcy55ID0gMDtcbiAqIH1cbiAqXG4gKiBmdW5jdGlvbiBDaXJjbGUoKSB7XG4gKiAgIFNoYXBlLmNhbGwodGhpcyk7XG4gKiB9XG4gKlxuICogQ2lyY2xlLnByb3RvdHlwZSA9IF8uY3JlYXRlKFNoYXBlLnByb3RvdHlwZSwgeyAnY29uc3RydWN0b3InOiBDaXJjbGUgfSk7XG4gKlxuICogdmFyIGNpcmNsZSA9IG5ldyBDaXJjbGU7XG4gKiBjaXJjbGUgaW5zdGFuY2VvZiBDaXJjbGU7XG4gKiAvLyA9PiB0cnVlXG4gKlxuICogY2lyY2xlIGluc3RhbmNlb2YgU2hhcGU7XG4gKiAvLyA9PiB0cnVlXG4gKi9cbmZ1bmN0aW9uIGNyZWF0ZShwcm90b3R5cGUsIHByb3BlcnRpZXMpIHtcbiAgdmFyIHJlc3VsdCA9IGJhc2VDcmVhdGUocHJvdG90eXBlKTtcbiAgcmV0dXJuIHByb3BlcnRpZXMgPyBhc3NpZ24ocmVzdWx0LCBwcm9wZXJ0aWVzKSA6IHJlc3VsdDtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBjcmVhdGU7XG4iLCIvKipcbiAqIExvLURhc2ggMi40LjEgKEN1c3RvbSBCdWlsZCkgPGh0dHA6Ly9sb2Rhc2guY29tLz5cbiAqIEJ1aWxkOiBgbG9kYXNoIG1vZHVsYXJpemUgbW9kZXJuIGV4cG9ydHM9XCJub2RlXCIgLW8gLi9tb2Rlcm4vYFxuICogQ29weXJpZ2h0IDIwMTItMjAxMyBUaGUgRG9qbyBGb3VuZGF0aW9uIDxodHRwOi8vZG9qb2ZvdW5kYXRpb24ub3JnLz5cbiAqIEJhc2VkIG9uIFVuZGVyc2NvcmUuanMgMS41LjIgPGh0dHA6Ly91bmRlcnNjb3JlanMub3JnL0xJQ0VOU0U+XG4gKiBDb3B5cmlnaHQgMjAwOS0yMDEzIEplcmVteSBBc2hrZW5hcywgRG9jdW1lbnRDbG91ZCBhbmQgSW52ZXN0aWdhdGl2ZSBSZXBvcnRlcnMgJiBFZGl0b3JzXG4gKiBBdmFpbGFibGUgdW5kZXIgTUlUIGxpY2Vuc2UgPGh0dHA6Ly9sb2Rhc2guY29tL2xpY2Vuc2U+XG4gKi9cbnZhciBrZXlzID0gcmVxdWlyZSgnLi9rZXlzJyksXG4gICAgb2JqZWN0VHlwZXMgPSByZXF1aXJlKCcuLi9pbnRlcm5hbHMvb2JqZWN0VHlwZXMnKTtcblxuLyoqXG4gKiBBc3NpZ25zIG93biBlbnVtZXJhYmxlIHByb3BlcnRpZXMgb2Ygc291cmNlIG9iamVjdChzKSB0byB0aGUgZGVzdGluYXRpb25cbiAqIG9iamVjdCBmb3IgYWxsIGRlc3RpbmF0aW9uIHByb3BlcnRpZXMgdGhhdCByZXNvbHZlIHRvIGB1bmRlZmluZWRgLiBPbmNlIGFcbiAqIHByb3BlcnR5IGlzIHNldCwgYWRkaXRpb25hbCBkZWZhdWx0cyBvZiB0aGUgc2FtZSBwcm9wZXJ0eSB3aWxsIGJlIGlnbm9yZWQuXG4gKlxuICogQHN0YXRpY1xuICogQG1lbWJlck9mIF9cbiAqIEB0eXBlIEZ1bmN0aW9uXG4gKiBAY2F0ZWdvcnkgT2JqZWN0c1xuICogQHBhcmFtIHtPYmplY3R9IG9iamVjdCBUaGUgZGVzdGluYXRpb24gb2JqZWN0LlxuICogQHBhcmFtIHsuLi5PYmplY3R9IFtzb3VyY2VdIFRoZSBzb3VyY2Ugb2JqZWN0cy5cbiAqIEBwYXJhbS0ge09iamVjdH0gW2d1YXJkXSBBbGxvd3Mgd29ya2luZyB3aXRoIGBfLnJlZHVjZWAgd2l0aG91dCB1c2luZyBpdHNcbiAqICBga2V5YCBhbmQgYG9iamVjdGAgYXJndW1lbnRzIGFzIHNvdXJjZXMuXG4gKiBAcmV0dXJucyB7T2JqZWN0fSBSZXR1cm5zIHRoZSBkZXN0aW5hdGlvbiBvYmplY3QuXG4gKiBAZXhhbXBsZVxuICpcbiAqIHZhciBvYmplY3QgPSB7ICduYW1lJzogJ2Jhcm5leScgfTtcbiAqIF8uZGVmYXVsdHMob2JqZWN0LCB7ICduYW1lJzogJ2ZyZWQnLCAnZW1wbG95ZXInOiAnc2xhdGUnIH0pO1xuICogLy8gPT4geyAnbmFtZSc6ICdiYXJuZXknLCAnZW1wbG95ZXInOiAnc2xhdGUnIH1cbiAqL1xudmFyIGRlZmF1bHRzID0gZnVuY3Rpb24ob2JqZWN0LCBzb3VyY2UsIGd1YXJkKSB7XG4gIHZhciBpbmRleCwgaXRlcmFibGUgPSBvYmplY3QsIHJlc3VsdCA9IGl0ZXJhYmxlO1xuICBpZiAoIWl0ZXJhYmxlKSByZXR1cm4gcmVzdWx0O1xuICB2YXIgYXJncyA9IGFyZ3VtZW50cyxcbiAgICAgIGFyZ3NJbmRleCA9IDAsXG4gICAgICBhcmdzTGVuZ3RoID0gdHlwZW9mIGd1YXJkID09ICdudW1iZXInID8gMiA6IGFyZ3MubGVuZ3RoO1xuICB3aGlsZSAoKythcmdzSW5kZXggPCBhcmdzTGVuZ3RoKSB7XG4gICAgaXRlcmFibGUgPSBhcmdzW2FyZ3NJbmRleF07XG4gICAgaWYgKGl0ZXJhYmxlICYmIG9iamVjdFR5cGVzW3R5cGVvZiBpdGVyYWJsZV0pIHtcbiAgICB2YXIgb3duSW5kZXggPSAtMSxcbiAgICAgICAgb3duUHJvcHMgPSBvYmplY3RUeXBlc1t0eXBlb2YgaXRlcmFibGVdICYmIGtleXMoaXRlcmFibGUpLFxuICAgICAgICBsZW5ndGggPSBvd25Qcm9wcyA/IG93blByb3BzLmxlbmd0aCA6IDA7XG5cbiAgICB3aGlsZSAoKytvd25JbmRleCA8IGxlbmd0aCkge1xuICAgICAgaW5kZXggPSBvd25Qcm9wc1tvd25JbmRleF07XG4gICAgICBpZiAodHlwZW9mIHJlc3VsdFtpbmRleF0gPT0gJ3VuZGVmaW5lZCcpIHJlc3VsdFtpbmRleF0gPSBpdGVyYWJsZVtpbmRleF07XG4gICAgfVxuICAgIH1cbiAgfVxuICByZXR1cm4gcmVzdWx0XG59O1xuXG5tb2R1bGUuZXhwb3J0cyA9IGRlZmF1bHRzO1xuIiwiLyoqXG4gKiBMby1EYXNoIDIuNC4xIChDdXN0b20gQnVpbGQpIDxodHRwOi8vbG9kYXNoLmNvbS8+XG4gKiBCdWlsZDogYGxvZGFzaCBtb2R1bGFyaXplIG1vZGVybiBleHBvcnRzPVwibm9kZVwiIC1vIC4vbW9kZXJuL2BcbiAqIENvcHlyaWdodCAyMDEyLTIwMTMgVGhlIERvam8gRm91bmRhdGlvbiA8aHR0cDovL2Rvam9mb3VuZGF0aW9uLm9yZy8+XG4gKiBCYXNlZCBvbiBVbmRlcnNjb3JlLmpzIDEuNS4yIDxodHRwOi8vdW5kZXJzY29yZWpzLm9yZy9MSUNFTlNFPlxuICogQ29weXJpZ2h0IDIwMDktMjAxMyBKZXJlbXkgQXNoa2VuYXMsIERvY3VtZW50Q2xvdWQgYW5kIEludmVzdGlnYXRpdmUgUmVwb3J0ZXJzICYgRWRpdG9yc1xuICogQXZhaWxhYmxlIHVuZGVyIE1JVCBsaWNlbnNlIDxodHRwOi8vbG9kYXNoLmNvbS9saWNlbnNlPlxuICovXG52YXIgYmFzZUNyZWF0ZUNhbGxiYWNrID0gcmVxdWlyZSgnLi4vaW50ZXJuYWxzL2Jhc2VDcmVhdGVDYWxsYmFjaycpLFxuICAgIG9iamVjdFR5cGVzID0gcmVxdWlyZSgnLi4vaW50ZXJuYWxzL29iamVjdFR5cGVzJyk7XG5cbi8qKlxuICogSXRlcmF0ZXMgb3ZlciBvd24gYW5kIGluaGVyaXRlZCBlbnVtZXJhYmxlIHByb3BlcnRpZXMgb2YgYW4gb2JqZWN0LFxuICogZXhlY3V0aW5nIHRoZSBjYWxsYmFjayBmb3IgZWFjaCBwcm9wZXJ0eS4gVGhlIGNhbGxiYWNrIGlzIGJvdW5kIHRvIGB0aGlzQXJnYFxuICogYW5kIGludm9rZWQgd2l0aCB0aHJlZSBhcmd1bWVudHM7ICh2YWx1ZSwga2V5LCBvYmplY3QpLiBDYWxsYmFja3MgbWF5IGV4aXRcbiAqIGl0ZXJhdGlvbiBlYXJseSBieSBleHBsaWNpdGx5IHJldHVybmluZyBgZmFsc2VgLlxuICpcbiAqIEBzdGF0aWNcbiAqIEBtZW1iZXJPZiBfXG4gKiBAdHlwZSBGdW5jdGlvblxuICogQGNhdGVnb3J5IE9iamVjdHNcbiAqIEBwYXJhbSB7T2JqZWN0fSBvYmplY3QgVGhlIG9iamVjdCB0byBpdGVyYXRlIG92ZXIuXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBbY2FsbGJhY2s9aWRlbnRpdHldIFRoZSBmdW5jdGlvbiBjYWxsZWQgcGVyIGl0ZXJhdGlvbi5cbiAqIEBwYXJhbSB7Kn0gW3RoaXNBcmddIFRoZSBgdGhpc2AgYmluZGluZyBvZiBgY2FsbGJhY2tgLlxuICogQHJldHVybnMge09iamVjdH0gUmV0dXJucyBgb2JqZWN0YC5cbiAqIEBleGFtcGxlXG4gKlxuICogZnVuY3Rpb24gU2hhcGUoKSB7XG4gKiAgIHRoaXMueCA9IDA7XG4gKiAgIHRoaXMueSA9IDA7XG4gKiB9XG4gKlxuICogU2hhcGUucHJvdG90eXBlLm1vdmUgPSBmdW5jdGlvbih4LCB5KSB7XG4gKiAgIHRoaXMueCArPSB4O1xuICogICB0aGlzLnkgKz0geTtcbiAqIH07XG4gKlxuICogXy5mb3JJbihuZXcgU2hhcGUsIGZ1bmN0aW9uKHZhbHVlLCBrZXkpIHtcbiAqICAgY29uc29sZS5sb2coa2V5KTtcbiAqIH0pO1xuICogLy8gPT4gbG9ncyAneCcsICd5JywgYW5kICdtb3ZlJyAocHJvcGVydHkgb3JkZXIgaXMgbm90IGd1YXJhbnRlZWQgYWNyb3NzIGVudmlyb25tZW50cylcbiAqL1xudmFyIGZvckluID0gZnVuY3Rpb24oY29sbGVjdGlvbiwgY2FsbGJhY2ssIHRoaXNBcmcpIHtcbiAgdmFyIGluZGV4LCBpdGVyYWJsZSA9IGNvbGxlY3Rpb24sIHJlc3VsdCA9IGl0ZXJhYmxlO1xuICBpZiAoIWl0ZXJhYmxlKSByZXR1cm4gcmVzdWx0O1xuICBpZiAoIW9iamVjdFR5cGVzW3R5cGVvZiBpdGVyYWJsZV0pIHJldHVybiByZXN1bHQ7XG4gIGNhbGxiYWNrID0gY2FsbGJhY2sgJiYgdHlwZW9mIHRoaXNBcmcgPT0gJ3VuZGVmaW5lZCcgPyBjYWxsYmFjayA6IGJhc2VDcmVhdGVDYWxsYmFjayhjYWxsYmFjaywgdGhpc0FyZywgMyk7XG4gICAgZm9yIChpbmRleCBpbiBpdGVyYWJsZSkge1xuICAgICAgaWYgKGNhbGxiYWNrKGl0ZXJhYmxlW2luZGV4XSwgaW5kZXgsIGNvbGxlY3Rpb24pID09PSBmYWxzZSkgcmV0dXJuIHJlc3VsdDtcbiAgICB9XG4gIHJldHVybiByZXN1bHRcbn07XG5cbm1vZHVsZS5leHBvcnRzID0gZm9ySW47XG4iLCIvKipcbiAqIExvLURhc2ggMi40LjEgKEN1c3RvbSBCdWlsZCkgPGh0dHA6Ly9sb2Rhc2guY29tLz5cbiAqIEJ1aWxkOiBgbG9kYXNoIG1vZHVsYXJpemUgbW9kZXJuIGV4cG9ydHM9XCJub2RlXCIgLW8gLi9tb2Rlcm4vYFxuICogQ29weXJpZ2h0IDIwMTItMjAxMyBUaGUgRG9qbyBGb3VuZGF0aW9uIDxodHRwOi8vZG9qb2ZvdW5kYXRpb24ub3JnLz5cbiAqIEJhc2VkIG9uIFVuZGVyc2NvcmUuanMgMS41LjIgPGh0dHA6Ly91bmRlcnNjb3JlanMub3JnL0xJQ0VOU0U+XG4gKiBDb3B5cmlnaHQgMjAwOS0yMDEzIEplcmVteSBBc2hrZW5hcywgRG9jdW1lbnRDbG91ZCBhbmQgSW52ZXN0aWdhdGl2ZSBSZXBvcnRlcnMgJiBFZGl0b3JzXG4gKiBBdmFpbGFibGUgdW5kZXIgTUlUIGxpY2Vuc2UgPGh0dHA6Ly9sb2Rhc2guY29tL2xpY2Vuc2U+XG4gKi9cbnZhciBiYXNlQ3JlYXRlQ2FsbGJhY2sgPSByZXF1aXJlKCcuLi9pbnRlcm5hbHMvYmFzZUNyZWF0ZUNhbGxiYWNrJyksXG4gICAga2V5cyA9IHJlcXVpcmUoJy4va2V5cycpLFxuICAgIG9iamVjdFR5cGVzID0gcmVxdWlyZSgnLi4vaW50ZXJuYWxzL29iamVjdFR5cGVzJyk7XG5cbi8qKlxuICogSXRlcmF0ZXMgb3ZlciBvd24gZW51bWVyYWJsZSBwcm9wZXJ0aWVzIG9mIGFuIG9iamVjdCwgZXhlY3V0aW5nIHRoZSBjYWxsYmFja1xuICogZm9yIGVhY2ggcHJvcGVydHkuIFRoZSBjYWxsYmFjayBpcyBib3VuZCB0byBgdGhpc0FyZ2AgYW5kIGludm9rZWQgd2l0aCB0aHJlZVxuICogYXJndW1lbnRzOyAodmFsdWUsIGtleSwgb2JqZWN0KS4gQ2FsbGJhY2tzIG1heSBleGl0IGl0ZXJhdGlvbiBlYXJseSBieVxuICogZXhwbGljaXRseSByZXR1cm5pbmcgYGZhbHNlYC5cbiAqXG4gKiBAc3RhdGljXG4gKiBAbWVtYmVyT2YgX1xuICogQHR5cGUgRnVuY3Rpb25cbiAqIEBjYXRlZ29yeSBPYmplY3RzXG4gKiBAcGFyYW0ge09iamVjdH0gb2JqZWN0IFRoZSBvYmplY3QgdG8gaXRlcmF0ZSBvdmVyLlxuICogQHBhcmFtIHtGdW5jdGlvbn0gW2NhbGxiYWNrPWlkZW50aXR5XSBUaGUgZnVuY3Rpb24gY2FsbGVkIHBlciBpdGVyYXRpb24uXG4gKiBAcGFyYW0geyp9IFt0aGlzQXJnXSBUaGUgYHRoaXNgIGJpbmRpbmcgb2YgYGNhbGxiYWNrYC5cbiAqIEByZXR1cm5zIHtPYmplY3R9IFJldHVybnMgYG9iamVjdGAuXG4gKiBAZXhhbXBsZVxuICpcbiAqIF8uZm9yT3duKHsgJzAnOiAnemVybycsICcxJzogJ29uZScsICdsZW5ndGgnOiAyIH0sIGZ1bmN0aW9uKG51bSwga2V5KSB7XG4gKiAgIGNvbnNvbGUubG9nKGtleSk7XG4gKiB9KTtcbiAqIC8vID0+IGxvZ3MgJzAnLCAnMScsIGFuZCAnbGVuZ3RoJyAocHJvcGVydHkgb3JkZXIgaXMgbm90IGd1YXJhbnRlZWQgYWNyb3NzIGVudmlyb25tZW50cylcbiAqL1xudmFyIGZvck93biA9IGZ1bmN0aW9uKGNvbGxlY3Rpb24sIGNhbGxiYWNrLCB0aGlzQXJnKSB7XG4gIHZhciBpbmRleCwgaXRlcmFibGUgPSBjb2xsZWN0aW9uLCByZXN1bHQgPSBpdGVyYWJsZTtcbiAgaWYgKCFpdGVyYWJsZSkgcmV0dXJuIHJlc3VsdDtcbiAgaWYgKCFvYmplY3RUeXBlc1t0eXBlb2YgaXRlcmFibGVdKSByZXR1cm4gcmVzdWx0O1xuICBjYWxsYmFjayA9IGNhbGxiYWNrICYmIHR5cGVvZiB0aGlzQXJnID09ICd1bmRlZmluZWQnID8gY2FsbGJhY2sgOiBiYXNlQ3JlYXRlQ2FsbGJhY2soY2FsbGJhY2ssIHRoaXNBcmcsIDMpO1xuICAgIHZhciBvd25JbmRleCA9IC0xLFxuICAgICAgICBvd25Qcm9wcyA9IG9iamVjdFR5cGVzW3R5cGVvZiBpdGVyYWJsZV0gJiYga2V5cyhpdGVyYWJsZSksXG4gICAgICAgIGxlbmd0aCA9IG93blByb3BzID8gb3duUHJvcHMubGVuZ3RoIDogMDtcblxuICAgIHdoaWxlICgrK293bkluZGV4IDwgbGVuZ3RoKSB7XG4gICAgICBpbmRleCA9IG93blByb3BzW293bkluZGV4XTtcbiAgICAgIGlmIChjYWxsYmFjayhpdGVyYWJsZVtpbmRleF0sIGluZGV4LCBjb2xsZWN0aW9uKSA9PT0gZmFsc2UpIHJldHVybiByZXN1bHQ7XG4gICAgfVxuICByZXR1cm4gcmVzdWx0XG59O1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZvck93bjtcbiIsIi8qKlxuICogTG8tRGFzaCAyLjQuMSAoQ3VzdG9tIEJ1aWxkKSA8aHR0cDovL2xvZGFzaC5jb20vPlxuICogQnVpbGQ6IGBsb2Rhc2ggbW9kdWxhcml6ZSBtb2Rlcm4gZXhwb3J0cz1cIm5vZGVcIiAtbyAuL21vZGVybi9gXG4gKiBDb3B5cmlnaHQgMjAxMi0yMDEzIFRoZSBEb2pvIEZvdW5kYXRpb24gPGh0dHA6Ly9kb2pvZm91bmRhdGlvbi5vcmcvPlxuICogQmFzZWQgb24gVW5kZXJzY29yZS5qcyAxLjUuMiA8aHR0cDovL3VuZGVyc2NvcmVqcy5vcmcvTElDRU5TRT5cbiAqIENvcHlyaWdodCAyMDA5LTIwMTMgSmVyZW15IEFzaGtlbmFzLCBEb2N1bWVudENsb3VkIGFuZCBJbnZlc3RpZ2F0aXZlIFJlcG9ydGVycyAmIEVkaXRvcnNcbiAqIEF2YWlsYWJsZSB1bmRlciBNSVQgbGljZW5zZSA8aHR0cDovL2xvZGFzaC5jb20vbGljZW5zZT5cbiAqL1xudmFyIGZvckluID0gcmVxdWlyZSgnLi9mb3JJbicpLFxuICAgIGlzRnVuY3Rpb24gPSByZXF1aXJlKCcuL2lzRnVuY3Rpb24nKTtcblxuLyoqXG4gKiBDcmVhdGVzIGEgc29ydGVkIGFycmF5IG9mIHByb3BlcnR5IG5hbWVzIG9mIGFsbCBlbnVtZXJhYmxlIHByb3BlcnRpZXMsXG4gKiBvd24gYW5kIGluaGVyaXRlZCwgb2YgYG9iamVjdGAgdGhhdCBoYXZlIGZ1bmN0aW9uIHZhbHVlcy5cbiAqXG4gKiBAc3RhdGljXG4gKiBAbWVtYmVyT2YgX1xuICogQGFsaWFzIG1ldGhvZHNcbiAqIEBjYXRlZ29yeSBPYmplY3RzXG4gKiBAcGFyYW0ge09iamVjdH0gb2JqZWN0IFRoZSBvYmplY3QgdG8gaW5zcGVjdC5cbiAqIEByZXR1cm5zIHtBcnJheX0gUmV0dXJucyBhbiBhcnJheSBvZiBwcm9wZXJ0eSBuYW1lcyB0aGF0IGhhdmUgZnVuY3Rpb24gdmFsdWVzLlxuICogQGV4YW1wbGVcbiAqXG4gKiBfLmZ1bmN0aW9ucyhfKTtcbiAqIC8vID0+IFsnYWxsJywgJ2FueScsICdiaW5kJywgJ2JpbmRBbGwnLCAnY2xvbmUnLCAnY29tcGFjdCcsICdjb21wb3NlJywgLi4uXVxuICovXG5mdW5jdGlvbiBmdW5jdGlvbnMob2JqZWN0KSB7XG4gIHZhciByZXN1bHQgPSBbXTtcbiAgZm9ySW4ob2JqZWN0LCBmdW5jdGlvbih2YWx1ZSwga2V5KSB7XG4gICAgaWYgKGlzRnVuY3Rpb24odmFsdWUpKSB7XG4gICAgICByZXN1bHQucHVzaChrZXkpO1xuICAgIH1cbiAgfSk7XG4gIHJldHVybiByZXN1bHQuc29ydCgpO1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9ucztcbiIsIi8qKlxuICogTG8tRGFzaCAyLjQuMSAoQ3VzdG9tIEJ1aWxkKSA8aHR0cDovL2xvZGFzaC5jb20vPlxuICogQnVpbGQ6IGBsb2Rhc2ggbW9kdWxhcml6ZSBtb2Rlcm4gZXhwb3J0cz1cIm5vZGVcIiAtbyAuL21vZGVybi9gXG4gKiBDb3B5cmlnaHQgMjAxMi0yMDEzIFRoZSBEb2pvIEZvdW5kYXRpb24gPGh0dHA6Ly9kb2pvZm91bmRhdGlvbi5vcmcvPlxuICogQmFzZWQgb24gVW5kZXJzY29yZS5qcyAxLjUuMiA8aHR0cDovL3VuZGVyc2NvcmVqcy5vcmcvTElDRU5TRT5cbiAqIENvcHlyaWdodCAyMDA5LTIwMTMgSmVyZW15IEFzaGtlbmFzLCBEb2N1bWVudENsb3VkIGFuZCBJbnZlc3RpZ2F0aXZlIFJlcG9ydGVycyAmIEVkaXRvcnNcbiAqIEF2YWlsYWJsZSB1bmRlciBNSVQgbGljZW5zZSA8aHR0cDovL2xvZGFzaC5jb20vbGljZW5zZT5cbiAqL1xuXG4vKiogVXNlZCBmb3IgbmF0aXZlIG1ldGhvZCByZWZlcmVuY2VzICovXG52YXIgb2JqZWN0UHJvdG8gPSBPYmplY3QucHJvdG90eXBlO1xuXG4vKiogTmF0aXZlIG1ldGhvZCBzaG9ydGN1dHMgKi9cbnZhciBoYXNPd25Qcm9wZXJ0eSA9IG9iamVjdFByb3RvLmhhc093blByb3BlcnR5O1xuXG4vKipcbiAqIENoZWNrcyBpZiB0aGUgc3BlY2lmaWVkIHByb3BlcnR5IG5hbWUgZXhpc3RzIGFzIGEgZGlyZWN0IHByb3BlcnR5IG9mIGBvYmplY3RgLFxuICogaW5zdGVhZCBvZiBhbiBpbmhlcml0ZWQgcHJvcGVydHkuXG4gKlxuICogQHN0YXRpY1xuICogQG1lbWJlck9mIF9cbiAqIEBjYXRlZ29yeSBPYmplY3RzXG4gKiBAcGFyYW0ge09iamVjdH0gb2JqZWN0IFRoZSBvYmplY3QgdG8gaW5zcGVjdC5cbiAqIEBwYXJhbSB7c3RyaW5nfSBrZXkgVGhlIG5hbWUgb2YgdGhlIHByb3BlcnR5IHRvIGNoZWNrLlxuICogQHJldHVybnMge2Jvb2xlYW59IFJldHVybnMgYHRydWVgIGlmIGtleSBpcyBhIGRpcmVjdCBwcm9wZXJ0eSwgZWxzZSBgZmFsc2VgLlxuICogQGV4YW1wbGVcbiAqXG4gKiBfLmhhcyh7ICdhJzogMSwgJ2InOiAyLCAnYyc6IDMgfSwgJ2InKTtcbiAqIC8vID0+IHRydWVcbiAqL1xuZnVuY3Rpb24gaGFzKG9iamVjdCwga2V5KSB7XG4gIHJldHVybiBvYmplY3QgPyBoYXNPd25Qcm9wZXJ0eS5jYWxsKG9iamVjdCwga2V5KSA6IGZhbHNlO1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IGhhcztcbiIsIi8qKlxuICogTG8tRGFzaCAyLjQuMSAoQ3VzdG9tIEJ1aWxkKSA8aHR0cDovL2xvZGFzaC5jb20vPlxuICogQnVpbGQ6IGBsb2Rhc2ggbW9kdWxhcml6ZSBtb2Rlcm4gZXhwb3J0cz1cIm5vZGVcIiAtbyAuL21vZGVybi9gXG4gKiBDb3B5cmlnaHQgMjAxMi0yMDEzIFRoZSBEb2pvIEZvdW5kYXRpb24gPGh0dHA6Ly9kb2pvZm91bmRhdGlvbi5vcmcvPlxuICogQmFzZWQgb24gVW5kZXJzY29yZS5qcyAxLjUuMiA8aHR0cDovL3VuZGVyc2NvcmVqcy5vcmcvTElDRU5TRT5cbiAqIENvcHlyaWdodCAyMDA5LTIwMTMgSmVyZW15IEFzaGtlbmFzLCBEb2N1bWVudENsb3VkIGFuZCBJbnZlc3RpZ2F0aXZlIFJlcG9ydGVycyAmIEVkaXRvcnNcbiAqIEF2YWlsYWJsZSB1bmRlciBNSVQgbGljZW5zZSA8aHR0cDovL2xvZGFzaC5jb20vbGljZW5zZT5cbiAqL1xuXG4vKiogYE9iamVjdCN0b1N0cmluZ2AgcmVzdWx0IHNob3J0Y3V0cyAqL1xudmFyIGFyZ3NDbGFzcyA9ICdbb2JqZWN0IEFyZ3VtZW50c10nO1xuXG4vKiogVXNlZCBmb3IgbmF0aXZlIG1ldGhvZCByZWZlcmVuY2VzICovXG52YXIgb2JqZWN0UHJvdG8gPSBPYmplY3QucHJvdG90eXBlO1xuXG4vKiogVXNlZCB0byByZXNvbHZlIHRoZSBpbnRlcm5hbCBbW0NsYXNzXV0gb2YgdmFsdWVzICovXG52YXIgdG9TdHJpbmcgPSBvYmplY3RQcm90by50b1N0cmluZztcblxuLyoqXG4gKiBDaGVja3MgaWYgYHZhbHVlYCBpcyBhbiBgYXJndW1lbnRzYCBvYmplY3QuXG4gKlxuICogQHN0YXRpY1xuICogQG1lbWJlck9mIF9cbiAqIEBjYXRlZ29yeSBPYmplY3RzXG4gKiBAcGFyYW0geyp9IHZhbHVlIFRoZSB2YWx1ZSB0byBjaGVjay5cbiAqIEByZXR1cm5zIHtib29sZWFufSBSZXR1cm5zIGB0cnVlYCBpZiB0aGUgYHZhbHVlYCBpcyBhbiBgYXJndW1lbnRzYCBvYmplY3QsIGVsc2UgYGZhbHNlYC5cbiAqIEBleGFtcGxlXG4gKlxuICogKGZ1bmN0aW9uKCkgeyByZXR1cm4gXy5pc0FyZ3VtZW50cyhhcmd1bWVudHMpOyB9KSgxLCAyLCAzKTtcbiAqIC8vID0+IHRydWVcbiAqXG4gKiBfLmlzQXJndW1lbnRzKFsxLCAyLCAzXSk7XG4gKiAvLyA9PiBmYWxzZVxuICovXG5mdW5jdGlvbiBpc0FyZ3VtZW50cyh2YWx1ZSkge1xuICByZXR1cm4gdmFsdWUgJiYgdHlwZW9mIHZhbHVlID09ICdvYmplY3QnICYmIHR5cGVvZiB2YWx1ZS5sZW5ndGggPT0gJ251bWJlcicgJiZcbiAgICB0b1N0cmluZy5jYWxsKHZhbHVlKSA9PSBhcmdzQ2xhc3MgfHwgZmFsc2U7XG59XG5cbm1vZHVsZS5leHBvcnRzID0gaXNBcmd1bWVudHM7XG4iLCIvKipcbiAqIExvLURhc2ggMi40LjEgKEN1c3RvbSBCdWlsZCkgPGh0dHA6Ly9sb2Rhc2guY29tLz5cbiAqIEJ1aWxkOiBgbG9kYXNoIG1vZHVsYXJpemUgbW9kZXJuIGV4cG9ydHM9XCJub2RlXCIgLW8gLi9tb2Rlcm4vYFxuICogQ29weXJpZ2h0IDIwMTItMjAxMyBUaGUgRG9qbyBGb3VuZGF0aW9uIDxodHRwOi8vZG9qb2ZvdW5kYXRpb24ub3JnLz5cbiAqIEJhc2VkIG9uIFVuZGVyc2NvcmUuanMgMS41LjIgPGh0dHA6Ly91bmRlcnNjb3JlanMub3JnL0xJQ0VOU0U+XG4gKiBDb3B5cmlnaHQgMjAwOS0yMDEzIEplcmVteSBBc2hrZW5hcywgRG9jdW1lbnRDbG91ZCBhbmQgSW52ZXN0aWdhdGl2ZSBSZXBvcnRlcnMgJiBFZGl0b3JzXG4gKiBBdmFpbGFibGUgdW5kZXIgTUlUIGxpY2Vuc2UgPGh0dHA6Ly9sb2Rhc2guY29tL2xpY2Vuc2U+XG4gKi9cbnZhciBpc05hdGl2ZSA9IHJlcXVpcmUoJy4uL2ludGVybmFscy9pc05hdGl2ZScpO1xuXG4vKiogYE9iamVjdCN0b1N0cmluZ2AgcmVzdWx0IHNob3J0Y3V0cyAqL1xudmFyIGFycmF5Q2xhc3MgPSAnW29iamVjdCBBcnJheV0nO1xuXG4vKiogVXNlZCBmb3IgbmF0aXZlIG1ldGhvZCByZWZlcmVuY2VzICovXG52YXIgb2JqZWN0UHJvdG8gPSBPYmplY3QucHJvdG90eXBlO1xuXG4vKiogVXNlZCB0byByZXNvbHZlIHRoZSBpbnRlcm5hbCBbW0NsYXNzXV0gb2YgdmFsdWVzICovXG52YXIgdG9TdHJpbmcgPSBvYmplY3RQcm90by50b1N0cmluZztcblxuLyogTmF0aXZlIG1ldGhvZCBzaG9ydGN1dHMgZm9yIG1ldGhvZHMgd2l0aCB0aGUgc2FtZSBuYW1lIGFzIG90aGVyIGBsb2Rhc2hgIG1ldGhvZHMgKi9cbnZhciBuYXRpdmVJc0FycmF5ID0gaXNOYXRpdmUobmF0aXZlSXNBcnJheSA9IEFycmF5LmlzQXJyYXkpICYmIG5hdGl2ZUlzQXJyYXk7XG5cbi8qKlxuICogQ2hlY2tzIGlmIGB2YWx1ZWAgaXMgYW4gYXJyYXkuXG4gKlxuICogQHN0YXRpY1xuICogQG1lbWJlck9mIF9cbiAqIEB0eXBlIEZ1bmN0aW9uXG4gKiBAY2F0ZWdvcnkgT2JqZWN0c1xuICogQHBhcmFtIHsqfSB2YWx1ZSBUaGUgdmFsdWUgdG8gY2hlY2suXG4gKiBAcmV0dXJucyB7Ym9vbGVhbn0gUmV0dXJucyBgdHJ1ZWAgaWYgdGhlIGB2YWx1ZWAgaXMgYW4gYXJyYXksIGVsc2UgYGZhbHNlYC5cbiAqIEBleGFtcGxlXG4gKlxuICogKGZ1bmN0aW9uKCkgeyByZXR1cm4gXy5pc0FycmF5KGFyZ3VtZW50cyk7IH0pKCk7XG4gKiAvLyA9PiBmYWxzZVxuICpcbiAqIF8uaXNBcnJheShbMSwgMiwgM10pO1xuICogLy8gPT4gdHJ1ZVxuICovXG52YXIgaXNBcnJheSA9IG5hdGl2ZUlzQXJyYXkgfHwgZnVuY3Rpb24odmFsdWUpIHtcbiAgcmV0dXJuIHZhbHVlICYmIHR5cGVvZiB2YWx1ZSA9PSAnb2JqZWN0JyAmJiB0eXBlb2YgdmFsdWUubGVuZ3RoID09ICdudW1iZXInICYmXG4gICAgdG9TdHJpbmcuY2FsbCh2YWx1ZSkgPT0gYXJyYXlDbGFzcyB8fCBmYWxzZTtcbn07XG5cbm1vZHVsZS5leHBvcnRzID0gaXNBcnJheTtcbiIsIi8qKlxuICogTG8tRGFzaCAyLjQuMSAoQ3VzdG9tIEJ1aWxkKSA8aHR0cDovL2xvZGFzaC5jb20vPlxuICogQnVpbGQ6IGBsb2Rhc2ggbW9kdWxhcml6ZSBtb2Rlcm4gZXhwb3J0cz1cIm5vZGVcIiAtbyAuL21vZGVybi9gXG4gKiBDb3B5cmlnaHQgMjAxMi0yMDEzIFRoZSBEb2pvIEZvdW5kYXRpb24gPGh0dHA6Ly9kb2pvZm91bmRhdGlvbi5vcmcvPlxuICogQmFzZWQgb24gVW5kZXJzY29yZS5qcyAxLjUuMiA8aHR0cDovL3VuZGVyc2NvcmVqcy5vcmcvTElDRU5TRT5cbiAqIENvcHlyaWdodCAyMDA5LTIwMTMgSmVyZW15IEFzaGtlbmFzLCBEb2N1bWVudENsb3VkIGFuZCBJbnZlc3RpZ2F0aXZlIFJlcG9ydGVycyAmIEVkaXRvcnNcbiAqIEF2YWlsYWJsZSB1bmRlciBNSVQgbGljZW5zZSA8aHR0cDovL2xvZGFzaC5jb20vbGljZW5zZT5cbiAqL1xuXG4vKipcbiAqIENoZWNrcyBpZiBgdmFsdWVgIGlzIGEgZnVuY3Rpb24uXG4gKlxuICogQHN0YXRpY1xuICogQG1lbWJlck9mIF9cbiAqIEBjYXRlZ29yeSBPYmplY3RzXG4gKiBAcGFyYW0geyp9IHZhbHVlIFRoZSB2YWx1ZSB0byBjaGVjay5cbiAqIEByZXR1cm5zIHtib29sZWFufSBSZXR1cm5zIGB0cnVlYCBpZiB0aGUgYHZhbHVlYCBpcyBhIGZ1bmN0aW9uLCBlbHNlIGBmYWxzZWAuXG4gKiBAZXhhbXBsZVxuICpcbiAqIF8uaXNGdW5jdGlvbihfKTtcbiAqIC8vID0+IHRydWVcbiAqL1xuZnVuY3Rpb24gaXNGdW5jdGlvbih2YWx1ZSkge1xuICByZXR1cm4gdHlwZW9mIHZhbHVlID09ICdmdW5jdGlvbic7XG59XG5cbm1vZHVsZS5leHBvcnRzID0gaXNGdW5jdGlvbjtcbiIsIi8qKlxuICogTG8tRGFzaCAyLjQuMSAoQ3VzdG9tIEJ1aWxkKSA8aHR0cDovL2xvZGFzaC5jb20vPlxuICogQnVpbGQ6IGBsb2Rhc2ggbW9kdWxhcml6ZSBtb2Rlcm4gZXhwb3J0cz1cIm5vZGVcIiAtbyAuL21vZGVybi9gXG4gKiBDb3B5cmlnaHQgMjAxMi0yMDEzIFRoZSBEb2pvIEZvdW5kYXRpb24gPGh0dHA6Ly9kb2pvZm91bmRhdGlvbi5vcmcvPlxuICogQmFzZWQgb24gVW5kZXJzY29yZS5qcyAxLjUuMiA8aHR0cDovL3VuZGVyc2NvcmVqcy5vcmcvTElDRU5TRT5cbiAqIENvcHlyaWdodCAyMDA5LTIwMTMgSmVyZW15IEFzaGtlbmFzLCBEb2N1bWVudENsb3VkIGFuZCBJbnZlc3RpZ2F0aXZlIFJlcG9ydGVycyAmIEVkaXRvcnNcbiAqIEF2YWlsYWJsZSB1bmRlciBNSVQgbGljZW5zZSA8aHR0cDovL2xvZGFzaC5jb20vbGljZW5zZT5cbiAqL1xudmFyIG9iamVjdFR5cGVzID0gcmVxdWlyZSgnLi4vaW50ZXJuYWxzL29iamVjdFR5cGVzJyk7XG5cbi8qKlxuICogQ2hlY2tzIGlmIGB2YWx1ZWAgaXMgdGhlIGxhbmd1YWdlIHR5cGUgb2YgT2JqZWN0LlxuICogKGUuZy4gYXJyYXlzLCBmdW5jdGlvbnMsIG9iamVjdHMsIHJlZ2V4ZXMsIGBuZXcgTnVtYmVyKDApYCwgYW5kIGBuZXcgU3RyaW5nKCcnKWApXG4gKlxuICogQHN0YXRpY1xuICogQG1lbWJlck9mIF9cbiAqIEBjYXRlZ29yeSBPYmplY3RzXG4gKiBAcGFyYW0geyp9IHZhbHVlIFRoZSB2YWx1ZSB0byBjaGVjay5cbiAqIEByZXR1cm5zIHtib29sZWFufSBSZXR1cm5zIGB0cnVlYCBpZiB0aGUgYHZhbHVlYCBpcyBhbiBvYmplY3QsIGVsc2UgYGZhbHNlYC5cbiAqIEBleGFtcGxlXG4gKlxuICogXy5pc09iamVjdCh7fSk7XG4gKiAvLyA9PiB0cnVlXG4gKlxuICogXy5pc09iamVjdChbMSwgMiwgM10pO1xuICogLy8gPT4gdHJ1ZVxuICpcbiAqIF8uaXNPYmplY3QoMSk7XG4gKiAvLyA9PiBmYWxzZVxuICovXG5mdW5jdGlvbiBpc09iamVjdCh2YWx1ZSkge1xuICAvLyBjaGVjayBpZiB0aGUgdmFsdWUgaXMgdGhlIEVDTUFTY3JpcHQgbGFuZ3VhZ2UgdHlwZSBvZiBPYmplY3RcbiAgLy8gaHR0cDovL2VzNS5naXRodWIuaW8vI3g4XG4gIC8vIGFuZCBhdm9pZCBhIFY4IGJ1Z1xuICAvLyBodHRwOi8vY29kZS5nb29nbGUuY29tL3AvdjgvaXNzdWVzL2RldGFpbD9pZD0yMjkxXG4gIHJldHVybiAhISh2YWx1ZSAmJiBvYmplY3RUeXBlc1t0eXBlb2YgdmFsdWVdKTtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBpc09iamVjdDtcbiIsIi8qKlxuICogTG8tRGFzaCAyLjQuMSAoQ3VzdG9tIEJ1aWxkKSA8aHR0cDovL2xvZGFzaC5jb20vPlxuICogQnVpbGQ6IGBsb2Rhc2ggbW9kdWxhcml6ZSBtb2Rlcm4gZXhwb3J0cz1cIm5vZGVcIiAtbyAuL21vZGVybi9gXG4gKiBDb3B5cmlnaHQgMjAxMi0yMDEzIFRoZSBEb2pvIEZvdW5kYXRpb24gPGh0dHA6Ly9kb2pvZm91bmRhdGlvbi5vcmcvPlxuICogQmFzZWQgb24gVW5kZXJzY29yZS5qcyAxLjUuMiA8aHR0cDovL3VuZGVyc2NvcmVqcy5vcmcvTElDRU5TRT5cbiAqIENvcHlyaWdodCAyMDA5LTIwMTMgSmVyZW15IEFzaGtlbmFzLCBEb2N1bWVudENsb3VkIGFuZCBJbnZlc3RpZ2F0aXZlIFJlcG9ydGVycyAmIEVkaXRvcnNcbiAqIEF2YWlsYWJsZSB1bmRlciBNSVQgbGljZW5zZSA8aHR0cDovL2xvZGFzaC5jb20vbGljZW5zZT5cbiAqL1xuXG4vKiogYE9iamVjdCN0b1N0cmluZ2AgcmVzdWx0IHNob3J0Y3V0cyAqL1xudmFyIHN0cmluZ0NsYXNzID0gJ1tvYmplY3QgU3RyaW5nXSc7XG5cbi8qKiBVc2VkIGZvciBuYXRpdmUgbWV0aG9kIHJlZmVyZW5jZXMgKi9cbnZhciBvYmplY3RQcm90byA9IE9iamVjdC5wcm90b3R5cGU7XG5cbi8qKiBVc2VkIHRvIHJlc29sdmUgdGhlIGludGVybmFsIFtbQ2xhc3NdXSBvZiB2YWx1ZXMgKi9cbnZhciB0b1N0cmluZyA9IG9iamVjdFByb3RvLnRvU3RyaW5nO1xuXG4vKipcbiAqIENoZWNrcyBpZiBgdmFsdWVgIGlzIGEgc3RyaW5nLlxuICpcbiAqIEBzdGF0aWNcbiAqIEBtZW1iZXJPZiBfXG4gKiBAY2F0ZWdvcnkgT2JqZWN0c1xuICogQHBhcmFtIHsqfSB2YWx1ZSBUaGUgdmFsdWUgdG8gY2hlY2suXG4gKiBAcmV0dXJucyB7Ym9vbGVhbn0gUmV0dXJucyBgdHJ1ZWAgaWYgdGhlIGB2YWx1ZWAgaXMgYSBzdHJpbmcsIGVsc2UgYGZhbHNlYC5cbiAqIEBleGFtcGxlXG4gKlxuICogXy5pc1N0cmluZygnZnJlZCcpO1xuICogLy8gPT4gdHJ1ZVxuICovXG5mdW5jdGlvbiBpc1N0cmluZyh2YWx1ZSkge1xuICByZXR1cm4gdHlwZW9mIHZhbHVlID09ICdzdHJpbmcnIHx8XG4gICAgdmFsdWUgJiYgdHlwZW9mIHZhbHVlID09ICdvYmplY3QnICYmIHRvU3RyaW5nLmNhbGwodmFsdWUpID09IHN0cmluZ0NsYXNzIHx8IGZhbHNlO1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IGlzU3RyaW5nO1xuIiwiLyoqXG4gKiBMby1EYXNoIDIuNC4xIChDdXN0b20gQnVpbGQpIDxodHRwOi8vbG9kYXNoLmNvbS8+XG4gKiBCdWlsZDogYGxvZGFzaCBtb2R1bGFyaXplIG1vZGVybiBleHBvcnRzPVwibm9kZVwiIC1vIC4vbW9kZXJuL2BcbiAqIENvcHlyaWdodCAyMDEyLTIwMTMgVGhlIERvam8gRm91bmRhdGlvbiA8aHR0cDovL2Rvam9mb3VuZGF0aW9uLm9yZy8+XG4gKiBCYXNlZCBvbiBVbmRlcnNjb3JlLmpzIDEuNS4yIDxodHRwOi8vdW5kZXJzY29yZWpzLm9yZy9MSUNFTlNFPlxuICogQ29weXJpZ2h0IDIwMDktMjAxMyBKZXJlbXkgQXNoa2VuYXMsIERvY3VtZW50Q2xvdWQgYW5kIEludmVzdGlnYXRpdmUgUmVwb3J0ZXJzICYgRWRpdG9yc1xuICogQXZhaWxhYmxlIHVuZGVyIE1JVCBsaWNlbnNlIDxodHRwOi8vbG9kYXNoLmNvbS9saWNlbnNlPlxuICovXG52YXIgaXNOYXRpdmUgPSByZXF1aXJlKCcuLi9pbnRlcm5hbHMvaXNOYXRpdmUnKSxcbiAgICBpc09iamVjdCA9IHJlcXVpcmUoJy4vaXNPYmplY3QnKSxcbiAgICBzaGltS2V5cyA9IHJlcXVpcmUoJy4uL2ludGVybmFscy9zaGltS2V5cycpO1xuXG4vKiBOYXRpdmUgbWV0aG9kIHNob3J0Y3V0cyBmb3IgbWV0aG9kcyB3aXRoIHRoZSBzYW1lIG5hbWUgYXMgb3RoZXIgYGxvZGFzaGAgbWV0aG9kcyAqL1xudmFyIG5hdGl2ZUtleXMgPSBpc05hdGl2ZShuYXRpdmVLZXlzID0gT2JqZWN0LmtleXMpICYmIG5hdGl2ZUtleXM7XG5cbi8qKlxuICogQ3JlYXRlcyBhbiBhcnJheSBjb21wb3NlZCBvZiB0aGUgb3duIGVudW1lcmFibGUgcHJvcGVydHkgbmFtZXMgb2YgYW4gb2JqZWN0LlxuICpcbiAqIEBzdGF0aWNcbiAqIEBtZW1iZXJPZiBfXG4gKiBAY2F0ZWdvcnkgT2JqZWN0c1xuICogQHBhcmFtIHtPYmplY3R9IG9iamVjdCBUaGUgb2JqZWN0IHRvIGluc3BlY3QuXG4gKiBAcmV0dXJucyB7QXJyYXl9IFJldHVybnMgYW4gYXJyYXkgb2YgcHJvcGVydHkgbmFtZXMuXG4gKiBAZXhhbXBsZVxuICpcbiAqIF8ua2V5cyh7ICdvbmUnOiAxLCAndHdvJzogMiwgJ3RocmVlJzogMyB9KTtcbiAqIC8vID0+IFsnb25lJywgJ3R3bycsICd0aHJlZSddIChwcm9wZXJ0eSBvcmRlciBpcyBub3QgZ3VhcmFudGVlZCBhY3Jvc3MgZW52aXJvbm1lbnRzKVxuICovXG52YXIga2V5cyA9ICFuYXRpdmVLZXlzID8gc2hpbUtleXMgOiBmdW5jdGlvbihvYmplY3QpIHtcbiAgaWYgKCFpc09iamVjdChvYmplY3QpKSB7XG4gICAgcmV0dXJuIFtdO1xuICB9XG4gIHJldHVybiBuYXRpdmVLZXlzKG9iamVjdCk7XG59O1xuXG5tb2R1bGUuZXhwb3J0cyA9IGtleXM7XG4iLCIvKipcbiAqIExvLURhc2ggMi40LjEgKEN1c3RvbSBCdWlsZCkgPGh0dHA6Ly9sb2Rhc2guY29tLz5cbiAqIEJ1aWxkOiBgbG9kYXNoIG1vZHVsYXJpemUgbW9kZXJuIGV4cG9ydHM9XCJub2RlXCIgLW8gLi9tb2Rlcm4vYFxuICogQ29weXJpZ2h0IDIwMTItMjAxMyBUaGUgRG9qbyBGb3VuZGF0aW9uIDxodHRwOi8vZG9qb2ZvdW5kYXRpb24ub3JnLz5cbiAqIEJhc2VkIG9uIFVuZGVyc2NvcmUuanMgMS41LjIgPGh0dHA6Ly91bmRlcnNjb3JlanMub3JnL0xJQ0VOU0U+XG4gKiBDb3B5cmlnaHQgMjAwOS0yMDEzIEplcmVteSBBc2hrZW5hcywgRG9jdW1lbnRDbG91ZCBhbmQgSW52ZXN0aWdhdGl2ZSBSZXBvcnRlcnMgJiBFZGl0b3JzXG4gKiBBdmFpbGFibGUgdW5kZXIgTUlUIGxpY2Vuc2UgPGh0dHA6Ly9sb2Rhc2guY29tL2xpY2Vuc2U+XG4gKi9cbnZhciBiYXNlRGlmZmVyZW5jZSA9IHJlcXVpcmUoJy4uL2ludGVybmFscy9iYXNlRGlmZmVyZW5jZScpLFxuICAgIGJhc2VGbGF0dGVuID0gcmVxdWlyZSgnLi4vaW50ZXJuYWxzL2Jhc2VGbGF0dGVuJyksXG4gICAgY3JlYXRlQ2FsbGJhY2sgPSByZXF1aXJlKCcuLi9mdW5jdGlvbnMvY3JlYXRlQ2FsbGJhY2snKSxcbiAgICBmb3JJbiA9IHJlcXVpcmUoJy4vZm9ySW4nKTtcblxuLyoqXG4gKiBDcmVhdGVzIGEgc2hhbGxvdyBjbG9uZSBvZiBgb2JqZWN0YCBleGNsdWRpbmcgdGhlIHNwZWNpZmllZCBwcm9wZXJ0aWVzLlxuICogUHJvcGVydHkgbmFtZXMgbWF5IGJlIHNwZWNpZmllZCBhcyBpbmRpdmlkdWFsIGFyZ3VtZW50cyBvciBhcyBhcnJheXMgb2ZcbiAqIHByb3BlcnR5IG5hbWVzLiBJZiBhIGNhbGxiYWNrIGlzIHByb3ZpZGVkIGl0IHdpbGwgYmUgZXhlY3V0ZWQgZm9yIGVhY2hcbiAqIHByb3BlcnR5IG9mIGBvYmplY3RgIG9taXR0aW5nIHRoZSBwcm9wZXJ0aWVzIHRoZSBjYWxsYmFjayByZXR1cm5zIHRydWV5XG4gKiBmb3IuIFRoZSBjYWxsYmFjayBpcyBib3VuZCB0byBgdGhpc0FyZ2AgYW5kIGludm9rZWQgd2l0aCB0aHJlZSBhcmd1bWVudHM7XG4gKiAodmFsdWUsIGtleSwgb2JqZWN0KS5cbiAqXG4gKiBAc3RhdGljXG4gKiBAbWVtYmVyT2YgX1xuICogQGNhdGVnb3J5IE9iamVjdHNcbiAqIEBwYXJhbSB7T2JqZWN0fSBvYmplY3QgVGhlIHNvdXJjZSBvYmplY3QuXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufC4uLnN0cmluZ3xzdHJpbmdbXX0gW2NhbGxiYWNrXSBUaGUgcHJvcGVydGllcyB0byBvbWl0IG9yIHRoZVxuICogIGZ1bmN0aW9uIGNhbGxlZCBwZXIgaXRlcmF0aW9uLlxuICogQHBhcmFtIHsqfSBbdGhpc0FyZ10gVGhlIGB0aGlzYCBiaW5kaW5nIG9mIGBjYWxsYmFja2AuXG4gKiBAcmV0dXJucyB7T2JqZWN0fSBSZXR1cm5zIGFuIG9iamVjdCB3aXRob3V0IHRoZSBvbWl0dGVkIHByb3BlcnRpZXMuXG4gKiBAZXhhbXBsZVxuICpcbiAqIF8ub21pdCh7ICduYW1lJzogJ2ZyZWQnLCAnYWdlJzogNDAgfSwgJ2FnZScpO1xuICogLy8gPT4geyAnbmFtZSc6ICdmcmVkJyB9XG4gKlxuICogXy5vbWl0KHsgJ25hbWUnOiAnZnJlZCcsICdhZ2UnOiA0MCB9LCBmdW5jdGlvbih2YWx1ZSkge1xuICogICByZXR1cm4gdHlwZW9mIHZhbHVlID09ICdudW1iZXInO1xuICogfSk7XG4gKiAvLyA9PiB7ICduYW1lJzogJ2ZyZWQnIH1cbiAqL1xuZnVuY3Rpb24gb21pdChvYmplY3QsIGNhbGxiYWNrLCB0aGlzQXJnKSB7XG4gIHZhciByZXN1bHQgPSB7fTtcbiAgaWYgKHR5cGVvZiBjYWxsYmFjayAhPSAnZnVuY3Rpb24nKSB7XG4gICAgdmFyIHByb3BzID0gW107XG4gICAgZm9ySW4ob2JqZWN0LCBmdW5jdGlvbih2YWx1ZSwga2V5KSB7XG4gICAgICBwcm9wcy5wdXNoKGtleSk7XG4gICAgfSk7XG4gICAgcHJvcHMgPSBiYXNlRGlmZmVyZW5jZShwcm9wcywgYmFzZUZsYXR0ZW4oYXJndW1lbnRzLCB0cnVlLCBmYWxzZSwgMSkpO1xuXG4gICAgdmFyIGluZGV4ID0gLTEsXG4gICAgICAgIGxlbmd0aCA9IHByb3BzLmxlbmd0aDtcblxuICAgIHdoaWxlICgrK2luZGV4IDwgbGVuZ3RoKSB7XG4gICAgICB2YXIga2V5ID0gcHJvcHNbaW5kZXhdO1xuICAgICAgcmVzdWx0W2tleV0gPSBvYmplY3Rba2V5XTtcbiAgICB9XG4gIH0gZWxzZSB7XG4gICAgY2FsbGJhY2sgPSBjcmVhdGVDYWxsYmFjayhjYWxsYmFjaywgdGhpc0FyZywgMyk7XG4gICAgZm9ySW4ob2JqZWN0LCBmdW5jdGlvbih2YWx1ZSwga2V5LCBvYmplY3QpIHtcbiAgICAgIGlmICghY2FsbGJhY2sodmFsdWUsIGtleSwgb2JqZWN0KSkge1xuICAgICAgICByZXN1bHRba2V5XSA9IHZhbHVlO1xuICAgICAgfVxuICAgIH0pO1xuICB9XG4gIHJldHVybiByZXN1bHQ7XG59XG5cbm1vZHVsZS5leHBvcnRzID0gb21pdDtcbiIsIi8qKlxuICogTG8tRGFzaCAyLjQuMSAoQ3VzdG9tIEJ1aWxkKSA8aHR0cDovL2xvZGFzaC5jb20vPlxuICogQnVpbGQ6IGBsb2Rhc2ggbW9kdWxhcml6ZSBtb2Rlcm4gZXhwb3J0cz1cIm5vZGVcIiAtbyAuL21vZGVybi9gXG4gKiBDb3B5cmlnaHQgMjAxMi0yMDEzIFRoZSBEb2pvIEZvdW5kYXRpb24gPGh0dHA6Ly9kb2pvZm91bmRhdGlvbi5vcmcvPlxuICogQmFzZWQgb24gVW5kZXJzY29yZS5qcyAxLjUuMiA8aHR0cDovL3VuZGVyc2NvcmVqcy5vcmcvTElDRU5TRT5cbiAqIENvcHlyaWdodCAyMDA5LTIwMTMgSmVyZW15IEFzaGtlbmFzLCBEb2N1bWVudENsb3VkIGFuZCBJbnZlc3RpZ2F0aXZlIFJlcG9ydGVycyAmIEVkaXRvcnNcbiAqIEF2YWlsYWJsZSB1bmRlciBNSVQgbGljZW5zZSA8aHR0cDovL2xvZGFzaC5jb20vbGljZW5zZT5cbiAqL1xudmFyIGJhc2VGbGF0dGVuID0gcmVxdWlyZSgnLi4vaW50ZXJuYWxzL2Jhc2VGbGF0dGVuJyksXG4gICAgY3JlYXRlQ2FsbGJhY2sgPSByZXF1aXJlKCcuLi9mdW5jdGlvbnMvY3JlYXRlQ2FsbGJhY2snKSxcbiAgICBmb3JJbiA9IHJlcXVpcmUoJy4vZm9ySW4nKSxcbiAgICBpc09iamVjdCA9IHJlcXVpcmUoJy4vaXNPYmplY3QnKTtcblxuLyoqXG4gKiBDcmVhdGVzIGEgc2hhbGxvdyBjbG9uZSBvZiBgb2JqZWN0YCBjb21wb3NlZCBvZiB0aGUgc3BlY2lmaWVkIHByb3BlcnRpZXMuXG4gKiBQcm9wZXJ0eSBuYW1lcyBtYXkgYmUgc3BlY2lmaWVkIGFzIGluZGl2aWR1YWwgYXJndW1lbnRzIG9yIGFzIGFycmF5cyBvZlxuICogcHJvcGVydHkgbmFtZXMuIElmIGEgY2FsbGJhY2sgaXMgcHJvdmlkZWQgaXQgd2lsbCBiZSBleGVjdXRlZCBmb3IgZWFjaFxuICogcHJvcGVydHkgb2YgYG9iamVjdGAgcGlja2luZyB0aGUgcHJvcGVydGllcyB0aGUgY2FsbGJhY2sgcmV0dXJucyB0cnVleVxuICogZm9yLiBUaGUgY2FsbGJhY2sgaXMgYm91bmQgdG8gYHRoaXNBcmdgIGFuZCBpbnZva2VkIHdpdGggdGhyZWUgYXJndW1lbnRzO1xuICogKHZhbHVlLCBrZXksIG9iamVjdCkuXG4gKlxuICogQHN0YXRpY1xuICogQG1lbWJlck9mIF9cbiAqIEBjYXRlZ29yeSBPYmplY3RzXG4gKiBAcGFyYW0ge09iamVjdH0gb2JqZWN0IFRoZSBzb3VyY2Ugb2JqZWN0LlxuICogQHBhcmFtIHtGdW5jdGlvbnwuLi5zdHJpbmd8c3RyaW5nW119IFtjYWxsYmFja10gVGhlIGZ1bmN0aW9uIGNhbGxlZCBwZXJcbiAqICBpdGVyYXRpb24gb3IgcHJvcGVydHkgbmFtZXMgdG8gcGljaywgc3BlY2lmaWVkIGFzIGluZGl2aWR1YWwgcHJvcGVydHlcbiAqICBuYW1lcyBvciBhcnJheXMgb2YgcHJvcGVydHkgbmFtZXMuXG4gKiBAcGFyYW0geyp9IFt0aGlzQXJnXSBUaGUgYHRoaXNgIGJpbmRpbmcgb2YgYGNhbGxiYWNrYC5cbiAqIEByZXR1cm5zIHtPYmplY3R9IFJldHVybnMgYW4gb2JqZWN0IGNvbXBvc2VkIG9mIHRoZSBwaWNrZWQgcHJvcGVydGllcy5cbiAqIEBleGFtcGxlXG4gKlxuICogXy5waWNrKHsgJ25hbWUnOiAnZnJlZCcsICdfdXNlcmlkJzogJ2ZyZWQxJyB9LCAnbmFtZScpO1xuICogLy8gPT4geyAnbmFtZSc6ICdmcmVkJyB9XG4gKlxuICogXy5waWNrKHsgJ25hbWUnOiAnZnJlZCcsICdfdXNlcmlkJzogJ2ZyZWQxJyB9LCBmdW5jdGlvbih2YWx1ZSwga2V5KSB7XG4gKiAgIHJldHVybiBrZXkuY2hhckF0KDApICE9ICdfJztcbiAqIH0pO1xuICogLy8gPT4geyAnbmFtZSc6ICdmcmVkJyB9XG4gKi9cbmZ1bmN0aW9uIHBpY2sob2JqZWN0LCBjYWxsYmFjaywgdGhpc0FyZykge1xuICB2YXIgcmVzdWx0ID0ge307XG4gIGlmICh0eXBlb2YgY2FsbGJhY2sgIT0gJ2Z1bmN0aW9uJykge1xuICAgIHZhciBpbmRleCA9IC0xLFxuICAgICAgICBwcm9wcyA9IGJhc2VGbGF0dGVuKGFyZ3VtZW50cywgdHJ1ZSwgZmFsc2UsIDEpLFxuICAgICAgICBsZW5ndGggPSBpc09iamVjdChvYmplY3QpID8gcHJvcHMubGVuZ3RoIDogMDtcblxuICAgIHdoaWxlICgrK2luZGV4IDwgbGVuZ3RoKSB7XG4gICAgICB2YXIga2V5ID0gcHJvcHNbaW5kZXhdO1xuICAgICAgaWYgKGtleSBpbiBvYmplY3QpIHtcbiAgICAgICAgcmVzdWx0W2tleV0gPSBvYmplY3Rba2V5XTtcbiAgICAgIH1cbiAgICB9XG4gIH0gZWxzZSB7XG4gICAgY2FsbGJhY2sgPSBjcmVhdGVDYWxsYmFjayhjYWxsYmFjaywgdGhpc0FyZywgMyk7XG4gICAgZm9ySW4ob2JqZWN0LCBmdW5jdGlvbih2YWx1ZSwga2V5LCBvYmplY3QpIHtcbiAgICAgIGlmIChjYWxsYmFjayh2YWx1ZSwga2V5LCBvYmplY3QpKSB7XG4gICAgICAgIHJlc3VsdFtrZXldID0gdmFsdWU7XG4gICAgICB9XG4gICAgfSk7XG4gIH1cbiAgcmV0dXJuIHJlc3VsdDtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBwaWNrO1xuIiwiLyoqXG4gKiBMby1EYXNoIDIuNC4xIChDdXN0b20gQnVpbGQpIDxodHRwOi8vbG9kYXNoLmNvbS8+XG4gKiBCdWlsZDogYGxvZGFzaCBtb2R1bGFyaXplIG1vZGVybiBleHBvcnRzPVwibm9kZVwiIC1vIC4vbW9kZXJuL2BcbiAqIENvcHlyaWdodCAyMDEyLTIwMTMgVGhlIERvam8gRm91bmRhdGlvbiA8aHR0cDovL2Rvam9mb3VuZGF0aW9uLm9yZy8+XG4gKiBCYXNlZCBvbiBVbmRlcnNjb3JlLmpzIDEuNS4yIDxodHRwOi8vdW5kZXJzY29yZWpzLm9yZy9MSUNFTlNFPlxuICogQ29weXJpZ2h0IDIwMDktMjAxMyBKZXJlbXkgQXNoa2VuYXMsIERvY3VtZW50Q2xvdWQgYW5kIEludmVzdGlnYXRpdmUgUmVwb3J0ZXJzICYgRWRpdG9yc1xuICogQXZhaWxhYmxlIHVuZGVyIE1JVCBsaWNlbnNlIDxodHRwOi8vbG9kYXNoLmNvbS9saWNlbnNlPlxuICovXG52YXIga2V5cyA9IHJlcXVpcmUoJy4va2V5cycpO1xuXG4vKipcbiAqIENyZWF0ZXMgYW4gYXJyYXkgY29tcG9zZWQgb2YgdGhlIG93biBlbnVtZXJhYmxlIHByb3BlcnR5IHZhbHVlcyBvZiBgb2JqZWN0YC5cbiAqXG4gKiBAc3RhdGljXG4gKiBAbWVtYmVyT2YgX1xuICogQGNhdGVnb3J5IE9iamVjdHNcbiAqIEBwYXJhbSB7T2JqZWN0fSBvYmplY3QgVGhlIG9iamVjdCB0byBpbnNwZWN0LlxuICogQHJldHVybnMge0FycmF5fSBSZXR1cm5zIGFuIGFycmF5IG9mIHByb3BlcnR5IHZhbHVlcy5cbiAqIEBleGFtcGxlXG4gKlxuICogXy52YWx1ZXMoeyAnb25lJzogMSwgJ3R3byc6IDIsICd0aHJlZSc6IDMgfSk7XG4gKiAvLyA9PiBbMSwgMiwgM10gKHByb3BlcnR5IG9yZGVyIGlzIG5vdCBndWFyYW50ZWVkIGFjcm9zcyBlbnZpcm9ubWVudHMpXG4gKi9cbmZ1bmN0aW9uIHZhbHVlcyhvYmplY3QpIHtcbiAgdmFyIGluZGV4ID0gLTEsXG4gICAgICBwcm9wcyA9IGtleXMob2JqZWN0KSxcbiAgICAgIGxlbmd0aCA9IHByb3BzLmxlbmd0aCxcbiAgICAgIHJlc3VsdCA9IEFycmF5KGxlbmd0aCk7XG5cbiAgd2hpbGUgKCsraW5kZXggPCBsZW5ndGgpIHtcbiAgICByZXN1bHRbaW5kZXhdID0gb2JqZWN0W3Byb3BzW2luZGV4XV07XG4gIH1cbiAgcmV0dXJuIHJlc3VsdDtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSB2YWx1ZXM7XG4iLCIoZnVuY3Rpb24gKGdsb2JhbCl7XG4vKipcbiAqIExvLURhc2ggMi40LjEgKEN1c3RvbSBCdWlsZCkgPGh0dHA6Ly9sb2Rhc2guY29tLz5cbiAqIEJ1aWxkOiBgbG9kYXNoIG1vZHVsYXJpemUgbW9kZXJuIGV4cG9ydHM9XCJub2RlXCIgLW8gLi9tb2Rlcm4vYFxuICogQ29weXJpZ2h0IDIwMTItMjAxMyBUaGUgRG9qbyBGb3VuZGF0aW9uIDxodHRwOi8vZG9qb2ZvdW5kYXRpb24ub3JnLz5cbiAqIEJhc2VkIG9uIFVuZGVyc2NvcmUuanMgMS41LjIgPGh0dHA6Ly91bmRlcnNjb3JlanMub3JnL0xJQ0VOU0U+XG4gKiBDb3B5cmlnaHQgMjAwOS0yMDEzIEplcmVteSBBc2hrZW5hcywgRG9jdW1lbnRDbG91ZCBhbmQgSW52ZXN0aWdhdGl2ZSBSZXBvcnRlcnMgJiBFZGl0b3JzXG4gKiBBdmFpbGFibGUgdW5kZXIgTUlUIGxpY2Vuc2UgPGh0dHA6Ly9sb2Rhc2guY29tL2xpY2Vuc2U+XG4gKi9cbnZhciBpc05hdGl2ZSA9IHJlcXVpcmUoJy4vaW50ZXJuYWxzL2lzTmF0aXZlJyk7XG5cbi8qKiBVc2VkIHRvIGRldGVjdCBmdW5jdGlvbnMgY29udGFpbmluZyBhIGB0aGlzYCByZWZlcmVuY2UgKi9cbnZhciByZVRoaXMgPSAvXFxidGhpc1xcYi87XG5cbi8qKlxuICogQW4gb2JqZWN0IHVzZWQgdG8gZmxhZyBlbnZpcm9ubWVudHMgZmVhdHVyZXMuXG4gKlxuICogQHN0YXRpY1xuICogQG1lbWJlck9mIF9cbiAqIEB0eXBlIE9iamVjdFxuICovXG52YXIgc3VwcG9ydCA9IHt9O1xuXG4vKipcbiAqIERldGVjdCBpZiBmdW5jdGlvbnMgY2FuIGJlIGRlY29tcGlsZWQgYnkgYEZ1bmN0aW9uI3RvU3RyaW5nYFxuICogKGFsbCBidXQgUFMzIGFuZCBvbGRlciBPcGVyYSBtb2JpbGUgYnJvd3NlcnMgJiBhdm9pZGVkIGluIFdpbmRvd3MgOCBhcHBzKS5cbiAqXG4gKiBAbWVtYmVyT2YgXy5zdXBwb3J0XG4gKiBAdHlwZSBib29sZWFuXG4gKi9cbnN1cHBvcnQuZnVuY0RlY29tcCA9ICFpc05hdGl2ZShnbG9iYWwuV2luUlRFcnJvcikgJiYgcmVUaGlzLnRlc3QoZnVuY3Rpb24oKSB7IHJldHVybiB0aGlzOyB9KTtcblxuLyoqXG4gKiBEZXRlY3QgaWYgYEZ1bmN0aW9uI25hbWVgIGlzIHN1cHBvcnRlZCAoYWxsIGJ1dCBJRSkuXG4gKlxuICogQG1lbWJlck9mIF8uc3VwcG9ydFxuICogQHR5cGUgYm9vbGVhblxuICovXG5zdXBwb3J0LmZ1bmNOYW1lcyA9IHR5cGVvZiBGdW5jdGlvbi5uYW1lID09ICdzdHJpbmcnO1xuXG5tb2R1bGUuZXhwb3J0cyA9IHN1cHBvcnQ7XG5cbn0pLmNhbGwodGhpcyx0eXBlb2Ygc2VsZiAhPT0gXCJ1bmRlZmluZWRcIiA/IHNlbGYgOiB0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93IDoge30pIiwiLyoqXG4gKiBMby1EYXNoIDIuNC4xIChDdXN0b20gQnVpbGQpIDxodHRwOi8vbG9kYXNoLmNvbS8+XG4gKiBCdWlsZDogYGxvZGFzaCBtb2R1bGFyaXplIG1vZGVybiBleHBvcnRzPVwibm9kZVwiIC1vIC4vbW9kZXJuL2BcbiAqIENvcHlyaWdodCAyMDEyLTIwMTMgVGhlIERvam8gRm91bmRhdGlvbiA8aHR0cDovL2Rvam9mb3VuZGF0aW9uLm9yZy8+XG4gKiBCYXNlZCBvbiBVbmRlcnNjb3JlLmpzIDEuNS4yIDxodHRwOi8vdW5kZXJzY29yZWpzLm9yZy9MSUNFTlNFPlxuICogQ29weXJpZ2h0IDIwMDktMjAxMyBKZXJlbXkgQXNoa2VuYXMsIERvY3VtZW50Q2xvdWQgYW5kIEludmVzdGlnYXRpdmUgUmVwb3J0ZXJzICYgRWRpdG9yc1xuICogQXZhaWxhYmxlIHVuZGVyIE1JVCBsaWNlbnNlIDxodHRwOi8vbG9kYXNoLmNvbS9saWNlbnNlPlxuICovXG52YXIgZXNjYXBlSHRtbENoYXIgPSByZXF1aXJlKCcuLi9pbnRlcm5hbHMvZXNjYXBlSHRtbENoYXInKSxcbiAgICBrZXlzID0gcmVxdWlyZSgnLi4vb2JqZWN0cy9rZXlzJyksXG4gICAgcmVVbmVzY2FwZWRIdG1sID0gcmVxdWlyZSgnLi4vaW50ZXJuYWxzL3JlVW5lc2NhcGVkSHRtbCcpO1xuXG4vKipcbiAqIENvbnZlcnRzIHRoZSBjaGFyYWN0ZXJzIGAmYCwgYDxgLCBgPmAsIGBcImAsIGFuZCBgJ2AgaW4gYHN0cmluZ2AgdG8gdGhlaXJcbiAqIGNvcnJlc3BvbmRpbmcgSFRNTCBlbnRpdGllcy5cbiAqXG4gKiBAc3RhdGljXG4gKiBAbWVtYmVyT2YgX1xuICogQGNhdGVnb3J5IFV0aWxpdGllc1xuICogQHBhcmFtIHtzdHJpbmd9IHN0cmluZyBUaGUgc3RyaW5nIHRvIGVzY2FwZS5cbiAqIEByZXR1cm5zIHtzdHJpbmd9IFJldHVybnMgdGhlIGVzY2FwZWQgc3RyaW5nLlxuICogQGV4YW1wbGVcbiAqXG4gKiBfLmVzY2FwZSgnRnJlZCwgV2lsbWEsICYgUGViYmxlcycpO1xuICogLy8gPT4gJ0ZyZWQsIFdpbG1hLCAmYW1wOyBQZWJibGVzJ1xuICovXG5mdW5jdGlvbiBlc2NhcGUoc3RyaW5nKSB7XG4gIHJldHVybiBzdHJpbmcgPT0gbnVsbCA/ICcnIDogU3RyaW5nKHN0cmluZykucmVwbGFjZShyZVVuZXNjYXBlZEh0bWwsIGVzY2FwZUh0bWxDaGFyKTtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBlc2NhcGU7XG4iLCIvKipcbiAqIExvLURhc2ggMi40LjEgKEN1c3RvbSBCdWlsZCkgPGh0dHA6Ly9sb2Rhc2guY29tLz5cbiAqIEJ1aWxkOiBgbG9kYXNoIG1vZHVsYXJpemUgbW9kZXJuIGV4cG9ydHM9XCJub2RlXCIgLW8gLi9tb2Rlcm4vYFxuICogQ29weXJpZ2h0IDIwMTItMjAxMyBUaGUgRG9qbyBGb3VuZGF0aW9uIDxodHRwOi8vZG9qb2ZvdW5kYXRpb24ub3JnLz5cbiAqIEJhc2VkIG9uIFVuZGVyc2NvcmUuanMgMS41LjIgPGh0dHA6Ly91bmRlcnNjb3JlanMub3JnL0xJQ0VOU0U+XG4gKiBDb3B5cmlnaHQgMjAwOS0yMDEzIEplcmVteSBBc2hrZW5hcywgRG9jdW1lbnRDbG91ZCBhbmQgSW52ZXN0aWdhdGl2ZSBSZXBvcnRlcnMgJiBFZGl0b3JzXG4gKiBBdmFpbGFibGUgdW5kZXIgTUlUIGxpY2Vuc2UgPGh0dHA6Ly9sb2Rhc2guY29tL2xpY2Vuc2U+XG4gKi9cblxuLyoqXG4gKiBUaGlzIG1ldGhvZCByZXR1cm5zIHRoZSBmaXJzdCBhcmd1bWVudCBwcm92aWRlZCB0byBpdC5cbiAqXG4gKiBAc3RhdGljXG4gKiBAbWVtYmVyT2YgX1xuICogQGNhdGVnb3J5IFV0aWxpdGllc1xuICogQHBhcmFtIHsqfSB2YWx1ZSBBbnkgdmFsdWUuXG4gKiBAcmV0dXJucyB7Kn0gUmV0dXJucyBgdmFsdWVgLlxuICogQGV4YW1wbGVcbiAqXG4gKiB2YXIgb2JqZWN0ID0geyAnbmFtZSc6ICdmcmVkJyB9O1xuICogXy5pZGVudGl0eShvYmplY3QpID09PSBvYmplY3Q7XG4gKiAvLyA9PiB0cnVlXG4gKi9cbmZ1bmN0aW9uIGlkZW50aXR5KHZhbHVlKSB7XG4gIHJldHVybiB2YWx1ZTtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBpZGVudGl0eTtcbiIsIi8qKlxuICogTG8tRGFzaCAyLjQuMSAoQ3VzdG9tIEJ1aWxkKSA8aHR0cDovL2xvZGFzaC5jb20vPlxuICogQnVpbGQ6IGBsb2Rhc2ggbW9kdWxhcml6ZSBtb2Rlcm4gZXhwb3J0cz1cIm5vZGVcIiAtbyAuL21vZGVybi9gXG4gKiBDb3B5cmlnaHQgMjAxMi0yMDEzIFRoZSBEb2pvIEZvdW5kYXRpb24gPGh0dHA6Ly9kb2pvZm91bmRhdGlvbi5vcmcvPlxuICogQmFzZWQgb24gVW5kZXJzY29yZS5qcyAxLjUuMiA8aHR0cDovL3VuZGVyc2NvcmVqcy5vcmcvTElDRU5TRT5cbiAqIENvcHlyaWdodCAyMDA5LTIwMTMgSmVyZW15IEFzaGtlbmFzLCBEb2N1bWVudENsb3VkIGFuZCBJbnZlc3RpZ2F0aXZlIFJlcG9ydGVycyAmIEVkaXRvcnNcbiAqIEF2YWlsYWJsZSB1bmRlciBNSVQgbGljZW5zZSA8aHR0cDovL2xvZGFzaC5jb20vbGljZW5zZT5cbiAqL1xuXG4vKipcbiAqIEEgbm8tb3BlcmF0aW9uIGZ1bmN0aW9uLlxuICpcbiAqIEBzdGF0aWNcbiAqIEBtZW1iZXJPZiBfXG4gKiBAY2F0ZWdvcnkgVXRpbGl0aWVzXG4gKiBAZXhhbXBsZVxuICpcbiAqIHZhciBvYmplY3QgPSB7ICduYW1lJzogJ2ZyZWQnIH07XG4gKiBfLm5vb3Aob2JqZWN0KSA9PT0gdW5kZWZpbmVkO1xuICogLy8gPT4gdHJ1ZVxuICovXG5mdW5jdGlvbiBub29wKCkge1xuICAvLyBubyBvcGVyYXRpb24gcGVyZm9ybWVkXG59XG5cbm1vZHVsZS5leHBvcnRzID0gbm9vcDtcbiIsIi8qKlxuICogTG8tRGFzaCAyLjQuMSAoQ3VzdG9tIEJ1aWxkKSA8aHR0cDovL2xvZGFzaC5jb20vPlxuICogQnVpbGQ6IGBsb2Rhc2ggbW9kdWxhcml6ZSBtb2Rlcm4gZXhwb3J0cz1cIm5vZGVcIiAtbyAuL21vZGVybi9gXG4gKiBDb3B5cmlnaHQgMjAxMi0yMDEzIFRoZSBEb2pvIEZvdW5kYXRpb24gPGh0dHA6Ly9kb2pvZm91bmRhdGlvbi5vcmcvPlxuICogQmFzZWQgb24gVW5kZXJzY29yZS5qcyAxLjUuMiA8aHR0cDovL3VuZGVyc2NvcmVqcy5vcmcvTElDRU5TRT5cbiAqIENvcHlyaWdodCAyMDA5LTIwMTMgSmVyZW15IEFzaGtlbmFzLCBEb2N1bWVudENsb3VkIGFuZCBJbnZlc3RpZ2F0aXZlIFJlcG9ydGVycyAmIEVkaXRvcnNcbiAqIEF2YWlsYWJsZSB1bmRlciBNSVQgbGljZW5zZSA8aHR0cDovL2xvZGFzaC5jb20vbGljZW5zZT5cbiAqL1xuXG4vKipcbiAqIENyZWF0ZXMgYSBcIl8ucGx1Y2tcIiBzdHlsZSBmdW5jdGlvbiwgd2hpY2ggcmV0dXJucyB0aGUgYGtleWAgdmFsdWUgb2YgYVxuICogZ2l2ZW4gb2JqZWN0LlxuICpcbiAqIEBzdGF0aWNcbiAqIEBtZW1iZXJPZiBfXG4gKiBAY2F0ZWdvcnkgVXRpbGl0aWVzXG4gKiBAcGFyYW0ge3N0cmluZ30ga2V5IFRoZSBuYW1lIG9mIHRoZSBwcm9wZXJ0eSB0byByZXRyaWV2ZS5cbiAqIEByZXR1cm5zIHtGdW5jdGlvbn0gUmV0dXJucyB0aGUgbmV3IGZ1bmN0aW9uLlxuICogQGV4YW1wbGVcbiAqXG4gKiB2YXIgY2hhcmFjdGVycyA9IFtcbiAqICAgeyAnbmFtZSc6ICdmcmVkJywgICAnYWdlJzogNDAgfSxcbiAqICAgeyAnbmFtZSc6ICdiYXJuZXknLCAnYWdlJzogMzYgfVxuICogXTtcbiAqXG4gKiB2YXIgZ2V0TmFtZSA9IF8ucHJvcGVydHkoJ25hbWUnKTtcbiAqXG4gKiBfLm1hcChjaGFyYWN0ZXJzLCBnZXROYW1lKTtcbiAqIC8vID0+IFsnYmFybmV5JywgJ2ZyZWQnXVxuICpcbiAqIF8uc29ydEJ5KGNoYXJhY3RlcnMsIGdldE5hbWUpO1xuICogLy8gPT4gW3sgJ25hbWUnOiAnYmFybmV5JywgJ2FnZSc6IDM2IH0sIHsgJ25hbWUnOiAnZnJlZCcsICAgJ2FnZSc6IDQwIH1dXG4gKi9cbmZ1bmN0aW9uIHByb3BlcnR5KGtleSkge1xuICByZXR1cm4gZnVuY3Rpb24ob2JqZWN0KSB7XG4gICAgcmV0dXJuIG9iamVjdFtrZXldO1xuICB9O1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IHByb3BlcnR5O1xuIiwiLyoqXG4gKiBMby1EYXNoIDIuNC4xIChDdXN0b20gQnVpbGQpIDxodHRwOi8vbG9kYXNoLmNvbS8+XG4gKiBCdWlsZDogYGxvZGFzaCBtb2R1bGFyaXplIG1vZGVybiBleHBvcnRzPVwibm9kZVwiIC1vIC4vbW9kZXJuL2BcbiAqIENvcHlyaWdodCAyMDEyLTIwMTMgVGhlIERvam8gRm91bmRhdGlvbiA8aHR0cDovL2Rvam9mb3VuZGF0aW9uLm9yZy8+XG4gKiBCYXNlZCBvbiBVbmRlcnNjb3JlLmpzIDEuNS4yIDxodHRwOi8vdW5kZXJzY29yZWpzLm9yZy9MSUNFTlNFPlxuICogQ29weXJpZ2h0IDIwMDktMjAxMyBKZXJlbXkgQXNoa2VuYXMsIERvY3VtZW50Q2xvdWQgYW5kIEludmVzdGlnYXRpdmUgUmVwb3J0ZXJzICYgRWRpdG9yc1xuICogQXZhaWxhYmxlIHVuZGVyIE1JVCBsaWNlbnNlIDxodHRwOi8vbG9kYXNoLmNvbS9saWNlbnNlPlxuICovXG52YXIgaXNGdW5jdGlvbiA9IHJlcXVpcmUoJy4uL29iamVjdHMvaXNGdW5jdGlvbicpO1xuXG4vKipcbiAqIFJlc29sdmVzIHRoZSB2YWx1ZSBvZiBwcm9wZXJ0eSBga2V5YCBvbiBgb2JqZWN0YC4gSWYgYGtleWAgaXMgYSBmdW5jdGlvblxuICogaXQgd2lsbCBiZSBpbnZva2VkIHdpdGggdGhlIGB0aGlzYCBiaW5kaW5nIG9mIGBvYmplY3RgIGFuZCBpdHMgcmVzdWx0IHJldHVybmVkLFxuICogZWxzZSB0aGUgcHJvcGVydHkgdmFsdWUgaXMgcmV0dXJuZWQuIElmIGBvYmplY3RgIGlzIGZhbHNleSB0aGVuIGB1bmRlZmluZWRgXG4gKiBpcyByZXR1cm5lZC5cbiAqXG4gKiBAc3RhdGljXG4gKiBAbWVtYmVyT2YgX1xuICogQGNhdGVnb3J5IFV0aWxpdGllc1xuICogQHBhcmFtIHtPYmplY3R9IG9iamVjdCBUaGUgb2JqZWN0IHRvIGluc3BlY3QuXG4gKiBAcGFyYW0ge3N0cmluZ30ga2V5IFRoZSBuYW1lIG9mIHRoZSBwcm9wZXJ0eSB0byByZXNvbHZlLlxuICogQHJldHVybnMgeyp9IFJldHVybnMgdGhlIHJlc29sdmVkIHZhbHVlLlxuICogQGV4YW1wbGVcbiAqXG4gKiB2YXIgb2JqZWN0ID0ge1xuICogICAnY2hlZXNlJzogJ2NydW1wZXRzJyxcbiAqICAgJ3N0dWZmJzogZnVuY3Rpb24oKSB7XG4gKiAgICAgcmV0dXJuICdub25zZW5zZSc7XG4gKiAgIH1cbiAqIH07XG4gKlxuICogXy5yZXN1bHQob2JqZWN0LCAnY2hlZXNlJyk7XG4gKiAvLyA9PiAnY3J1bXBldHMnXG4gKlxuICogXy5yZXN1bHQob2JqZWN0LCAnc3R1ZmYnKTtcbiAqIC8vID0+ICdub25zZW5zZSdcbiAqL1xuZnVuY3Rpb24gcmVzdWx0KG9iamVjdCwga2V5KSB7XG4gIGlmIChvYmplY3QpIHtcbiAgICB2YXIgdmFsdWUgPSBvYmplY3Rba2V5XTtcbiAgICByZXR1cm4gaXNGdW5jdGlvbih2YWx1ZSkgPyBvYmplY3Rba2V5XSgpIDogdmFsdWU7XG4gIH1cbn1cblxubW9kdWxlLmV4cG9ydHMgPSByZXN1bHQ7XG4iLCIvKipcbiAqIExvLURhc2ggMi40LjEgKEN1c3RvbSBCdWlsZCkgPGh0dHA6Ly9sb2Rhc2guY29tLz5cbiAqIEJ1aWxkOiBgbG9kYXNoIG1vZHVsYXJpemUgbW9kZXJuIGV4cG9ydHM9XCJub2RlXCIgLW8gLi9tb2Rlcm4vYFxuICogQ29weXJpZ2h0IDIwMTItMjAxMyBUaGUgRG9qbyBGb3VuZGF0aW9uIDxodHRwOi8vZG9qb2ZvdW5kYXRpb24ub3JnLz5cbiAqIEJhc2VkIG9uIFVuZGVyc2NvcmUuanMgMS41LjIgPGh0dHA6Ly91bmRlcnNjb3JlanMub3JnL0xJQ0VOU0U+XG4gKiBDb3B5cmlnaHQgMjAwOS0yMDEzIEplcmVteSBBc2hrZW5hcywgRG9jdW1lbnRDbG91ZCBhbmQgSW52ZXN0aWdhdGl2ZSBSZXBvcnRlcnMgJiBFZGl0b3JzXG4gKiBBdmFpbGFibGUgdW5kZXIgTUlUIGxpY2Vuc2UgPGh0dHA6Ly9sb2Rhc2guY29tL2xpY2Vuc2U+XG4gKi9cbnZhciBkZWZhdWx0cyA9IHJlcXVpcmUoJy4uL29iamVjdHMvZGVmYXVsdHMnKSxcbiAgICBlc2NhcGUgPSByZXF1aXJlKCcuL2VzY2FwZScpLFxuICAgIGVzY2FwZVN0cmluZ0NoYXIgPSByZXF1aXJlKCcuLi9pbnRlcm5hbHMvZXNjYXBlU3RyaW5nQ2hhcicpLFxuICAgIGtleXMgPSByZXF1aXJlKCcuLi9vYmplY3RzL2tleXMnKSxcbiAgICByZUludGVycG9sYXRlID0gcmVxdWlyZSgnLi4vaW50ZXJuYWxzL3JlSW50ZXJwb2xhdGUnKSxcbiAgICB0ZW1wbGF0ZVNldHRpbmdzID0gcmVxdWlyZSgnLi90ZW1wbGF0ZVNldHRpbmdzJyksXG4gICAgdmFsdWVzID0gcmVxdWlyZSgnLi4vb2JqZWN0cy92YWx1ZXMnKTtcblxuLyoqIFVzZWQgdG8gbWF0Y2ggZW1wdHkgc3RyaW5nIGxpdGVyYWxzIGluIGNvbXBpbGVkIHRlbXBsYXRlIHNvdXJjZSAqL1xudmFyIHJlRW1wdHlTdHJpbmdMZWFkaW5nID0gL1xcYl9fcCBcXCs9ICcnOy9nLFxuICAgIHJlRW1wdHlTdHJpbmdNaWRkbGUgPSAvXFxiKF9fcCBcXCs9KSAnJyBcXCsvZyxcbiAgICByZUVtcHR5U3RyaW5nVHJhaWxpbmcgPSAvKF9fZVxcKC4qP1xcKXxcXGJfX3RcXCkpIFxcK1xcbicnOy9nO1xuXG4vKipcbiAqIFVzZWQgdG8gbWF0Y2ggRVM2IHRlbXBsYXRlIGRlbGltaXRlcnNcbiAqIGh0dHA6Ly9wZW9wbGUubW96aWxsYS5vcmcvfmpvcmVuZG9yZmYvZXM2LWRyYWZ0Lmh0bWwjc2VjLWxpdGVyYWxzLXN0cmluZy1saXRlcmFsc1xuICovXG52YXIgcmVFc1RlbXBsYXRlID0gL1xcJFxceyhbXlxcXFx9XSooPzpcXFxcLlteXFxcXH1dKikqKVxcfS9nO1xuXG4vKiogVXNlZCB0byBlbnN1cmUgY2FwdHVyaW5nIG9yZGVyIG9mIHRlbXBsYXRlIGRlbGltaXRlcnMgKi9cbnZhciByZU5vTWF0Y2ggPSAvKCReKS87XG5cbi8qKiBVc2VkIHRvIG1hdGNoIHVuZXNjYXBlZCBjaGFyYWN0ZXJzIGluIGNvbXBpbGVkIHN0cmluZyBsaXRlcmFscyAqL1xudmFyIHJlVW5lc2NhcGVkU3RyaW5nID0gL1snXFxuXFxyXFx0XFx1MjAyOFxcdTIwMjlcXFxcXS9nO1xuXG4vKipcbiAqIEEgbWljcm8tdGVtcGxhdGluZyBtZXRob2QgdGhhdCBoYW5kbGVzIGFyYml0cmFyeSBkZWxpbWl0ZXJzLCBwcmVzZXJ2ZXNcbiAqIHdoaXRlc3BhY2UsIGFuZCBjb3JyZWN0bHkgZXNjYXBlcyBxdW90ZXMgd2l0aGluIGludGVycG9sYXRlZCBjb2RlLlxuICpcbiAqIE5vdGU6IEluIHRoZSBkZXZlbG9wbWVudCBidWlsZCwgYF8udGVtcGxhdGVgIHV0aWxpemVzIHNvdXJjZVVSTHMgZm9yIGVhc2llclxuICogZGVidWdnaW5nLiBTZWUgaHR0cDovL3d3dy5odG1sNXJvY2tzLmNvbS9lbi90dXRvcmlhbHMvZGV2ZWxvcGVydG9vbHMvc291cmNlbWFwcy8jdG9jLXNvdXJjZXVybFxuICpcbiAqIEZvciBtb3JlIGluZm9ybWF0aW9uIG9uIHByZWNvbXBpbGluZyB0ZW1wbGF0ZXMgc2VlOlxuICogaHR0cDovL2xvZGFzaC5jb20vY3VzdG9tLWJ1aWxkc1xuICpcbiAqIEZvciBtb3JlIGluZm9ybWF0aW9uIG9uIENocm9tZSBleHRlbnNpb24gc2FuZGJveGVzIHNlZTpcbiAqIGh0dHA6Ly9kZXZlbG9wZXIuY2hyb21lLmNvbS9zdGFibGUvZXh0ZW5zaW9ucy9zYW5kYm94aW5nRXZhbC5odG1sXG4gKlxuICogQHN0YXRpY1xuICogQG1lbWJlck9mIF9cbiAqIEBjYXRlZ29yeSBVdGlsaXRpZXNcbiAqIEBwYXJhbSB7c3RyaW5nfSB0ZXh0IFRoZSB0ZW1wbGF0ZSB0ZXh0LlxuICogQHBhcmFtIHtPYmplY3R9IGRhdGEgVGhlIGRhdGEgb2JqZWN0IHVzZWQgdG8gcG9wdWxhdGUgdGhlIHRleHQuXG4gKiBAcGFyYW0ge09iamVjdH0gW29wdGlvbnNdIFRoZSBvcHRpb25zIG9iamVjdC5cbiAqIEBwYXJhbSB7UmVnRXhwfSBbb3B0aW9ucy5lc2NhcGVdIFRoZSBcImVzY2FwZVwiIGRlbGltaXRlci5cbiAqIEBwYXJhbSB7UmVnRXhwfSBbb3B0aW9ucy5ldmFsdWF0ZV0gVGhlIFwiZXZhbHVhdGVcIiBkZWxpbWl0ZXIuXG4gKiBAcGFyYW0ge09iamVjdH0gW29wdGlvbnMuaW1wb3J0c10gQW4gb2JqZWN0IHRvIGltcG9ydCBpbnRvIHRoZSB0ZW1wbGF0ZSBhcyBsb2NhbCB2YXJpYWJsZXMuXG4gKiBAcGFyYW0ge1JlZ0V4cH0gW29wdGlvbnMuaW50ZXJwb2xhdGVdIFRoZSBcImludGVycG9sYXRlXCIgZGVsaW1pdGVyLlxuICogQHBhcmFtIHtzdHJpbmd9IFtzb3VyY2VVUkxdIFRoZSBzb3VyY2VVUkwgb2YgdGhlIHRlbXBsYXRlJ3MgY29tcGlsZWQgc291cmNlLlxuICogQHBhcmFtIHtzdHJpbmd9IFt2YXJpYWJsZV0gVGhlIGRhdGEgb2JqZWN0IHZhcmlhYmxlIG5hbWUuXG4gKiBAcmV0dXJucyB7RnVuY3Rpb258c3RyaW5nfSBSZXR1cm5zIGEgY29tcGlsZWQgZnVuY3Rpb24gd2hlbiBubyBgZGF0YWAgb2JqZWN0XG4gKiAgaXMgZ2l2ZW4sIGVsc2UgaXQgcmV0dXJucyB0aGUgaW50ZXJwb2xhdGVkIHRleHQuXG4gKiBAZXhhbXBsZVxuICpcbiAqIC8vIHVzaW5nIHRoZSBcImludGVycG9sYXRlXCIgZGVsaW1pdGVyIHRvIGNyZWF0ZSBhIGNvbXBpbGVkIHRlbXBsYXRlXG4gKiB2YXIgY29tcGlsZWQgPSBfLnRlbXBsYXRlKCdoZWxsbyA8JT0gbmFtZSAlPicpO1xuICogY29tcGlsZWQoeyAnbmFtZSc6ICdmcmVkJyB9KTtcbiAqIC8vID0+ICdoZWxsbyBmcmVkJ1xuICpcbiAqIC8vIHVzaW5nIHRoZSBcImVzY2FwZVwiIGRlbGltaXRlciB0byBlc2NhcGUgSFRNTCBpbiBkYXRhIHByb3BlcnR5IHZhbHVlc1xuICogXy50ZW1wbGF0ZSgnPGI+PCUtIHZhbHVlICU+PC9iPicsIHsgJ3ZhbHVlJzogJzxzY3JpcHQ+JyB9KTtcbiAqIC8vID0+ICc8Yj4mbHQ7c2NyaXB0Jmd0OzwvYj4nXG4gKlxuICogLy8gdXNpbmcgdGhlIFwiZXZhbHVhdGVcIiBkZWxpbWl0ZXIgdG8gZ2VuZXJhdGUgSFRNTFxuICogdmFyIGxpc3QgPSAnPCUgXy5mb3JFYWNoKHBlb3BsZSwgZnVuY3Rpb24obmFtZSkgeyAlPjxsaT48JS0gbmFtZSAlPjwvbGk+PCUgfSk7ICU+JztcbiAqIF8udGVtcGxhdGUobGlzdCwgeyAncGVvcGxlJzogWydmcmVkJywgJ2Jhcm5leSddIH0pO1xuICogLy8gPT4gJzxsaT5mcmVkPC9saT48bGk+YmFybmV5PC9saT4nXG4gKlxuICogLy8gdXNpbmcgdGhlIEVTNiBkZWxpbWl0ZXIgYXMgYW4gYWx0ZXJuYXRpdmUgdG8gdGhlIGRlZmF1bHQgXCJpbnRlcnBvbGF0ZVwiIGRlbGltaXRlclxuICogXy50ZW1wbGF0ZSgnaGVsbG8gJHsgbmFtZSB9JywgeyAnbmFtZSc6ICdwZWJibGVzJyB9KTtcbiAqIC8vID0+ICdoZWxsbyBwZWJibGVzJ1xuICpcbiAqIC8vIHVzaW5nIHRoZSBpbnRlcm5hbCBgcHJpbnRgIGZ1bmN0aW9uIGluIFwiZXZhbHVhdGVcIiBkZWxpbWl0ZXJzXG4gKiBfLnRlbXBsYXRlKCc8JSBwcmludChcImhlbGxvIFwiICsgbmFtZSk7ICU+IScsIHsgJ25hbWUnOiAnYmFybmV5JyB9KTtcbiAqIC8vID0+ICdoZWxsbyBiYXJuZXkhJ1xuICpcbiAqIC8vIHVzaW5nIGEgY3VzdG9tIHRlbXBsYXRlIGRlbGltaXRlcnNcbiAqIF8udGVtcGxhdGVTZXR0aW5ncyA9IHtcbiAqICAgJ2ludGVycG9sYXRlJzogL3t7KFtcXHNcXFNdKz8pfX0vZ1xuICogfTtcbiAqXG4gKiBfLnRlbXBsYXRlKCdoZWxsbyB7eyBuYW1lIH19IScsIHsgJ25hbWUnOiAnbXVzdGFjaGUnIH0pO1xuICogLy8gPT4gJ2hlbGxvIG11c3RhY2hlISdcbiAqXG4gKiAvLyB1c2luZyB0aGUgYGltcG9ydHNgIG9wdGlvbiB0byBpbXBvcnQgalF1ZXJ5XG4gKiB2YXIgbGlzdCA9ICc8JSBqcS5lYWNoKHBlb3BsZSwgZnVuY3Rpb24obmFtZSkgeyAlPjxsaT48JS0gbmFtZSAlPjwvbGk+PCUgfSk7ICU+JztcbiAqIF8udGVtcGxhdGUobGlzdCwgeyAncGVvcGxlJzogWydmcmVkJywgJ2Jhcm5leSddIH0sIHsgJ2ltcG9ydHMnOiB7ICdqcSc6IGpRdWVyeSB9IH0pO1xuICogLy8gPT4gJzxsaT5mcmVkPC9saT48bGk+YmFybmV5PC9saT4nXG4gKlxuICogLy8gdXNpbmcgdGhlIGBzb3VyY2VVUkxgIG9wdGlvbiB0byBzcGVjaWZ5IGEgY3VzdG9tIHNvdXJjZVVSTCBmb3IgdGhlIHRlbXBsYXRlXG4gKiB2YXIgY29tcGlsZWQgPSBfLnRlbXBsYXRlKCdoZWxsbyA8JT0gbmFtZSAlPicsIG51bGwsIHsgJ3NvdXJjZVVSTCc6ICcvYmFzaWMvZ3JlZXRpbmcuanN0JyB9KTtcbiAqIGNvbXBpbGVkKGRhdGEpO1xuICogLy8gPT4gZmluZCB0aGUgc291cmNlIG9mIFwiZ3JlZXRpbmcuanN0XCIgdW5kZXIgdGhlIFNvdXJjZXMgdGFiIG9yIFJlc291cmNlcyBwYW5lbCBvZiB0aGUgd2ViIGluc3BlY3RvclxuICpcbiAqIC8vIHVzaW5nIHRoZSBgdmFyaWFibGVgIG9wdGlvbiB0byBlbnN1cmUgYSB3aXRoLXN0YXRlbWVudCBpc24ndCB1c2VkIGluIHRoZSBjb21waWxlZCB0ZW1wbGF0ZVxuICogdmFyIGNvbXBpbGVkID0gXy50ZW1wbGF0ZSgnaGkgPCU9IGRhdGEubmFtZSAlPiEnLCBudWxsLCB7ICd2YXJpYWJsZSc6ICdkYXRhJyB9KTtcbiAqIGNvbXBpbGVkLnNvdXJjZTtcbiAqIC8vID0+IGZ1bmN0aW9uKGRhdGEpIHtcbiAqICAgdmFyIF9fdCwgX19wID0gJycsIF9fZSA9IF8uZXNjYXBlO1xuICogICBfX3AgKz0gJ2hpICcgKyAoKF9fdCA9ICggZGF0YS5uYW1lICkpID09IG51bGwgPyAnJyA6IF9fdCkgKyAnISc7XG4gKiAgIHJldHVybiBfX3A7XG4gKiB9XG4gKlxuICogLy8gdXNpbmcgdGhlIGBzb3VyY2VgIHByb3BlcnR5IHRvIGlubGluZSBjb21waWxlZCB0ZW1wbGF0ZXMgZm9yIG1lYW5pbmdmdWxcbiAqIC8vIGxpbmUgbnVtYmVycyBpbiBlcnJvciBtZXNzYWdlcyBhbmQgYSBzdGFjayB0cmFjZVxuICogZnMud3JpdGVGaWxlU3luYyhwYXRoLmpvaW4oY3dkLCAnanN0LmpzJyksICdcXFxuICogICB2YXIgSlNUID0ge1xcXG4gKiAgICAgXCJtYWluXCI6ICcgKyBfLnRlbXBsYXRlKG1haW5UZXh0KS5zb3VyY2UgKyAnXFxcbiAqICAgfTtcXFxuICogJyk7XG4gKi9cbmZ1bmN0aW9uIHRlbXBsYXRlKHRleHQsIGRhdGEsIG9wdGlvbnMpIHtcbiAgLy8gYmFzZWQgb24gSm9obiBSZXNpZydzIGB0bXBsYCBpbXBsZW1lbnRhdGlvblxuICAvLyBodHRwOi8vZWpvaG4ub3JnL2Jsb2cvamF2YXNjcmlwdC1taWNyby10ZW1wbGF0aW5nL1xuICAvLyBhbmQgTGF1cmEgRG9rdG9yb3ZhJ3MgZG9ULmpzXG4gIC8vIGh0dHBzOi8vZ2l0aHViLmNvbS9vbGFkby9kb1RcbiAgdmFyIHNldHRpbmdzID0gdGVtcGxhdGVTZXR0aW5ncy5pbXBvcnRzLl8udGVtcGxhdGVTZXR0aW5ncyB8fCB0ZW1wbGF0ZVNldHRpbmdzO1xuICB0ZXh0ID0gU3RyaW5nKHRleHQgfHwgJycpO1xuXG4gIC8vIGF2b2lkIG1pc3NpbmcgZGVwZW5kZW5jaWVzIHdoZW4gYGl0ZXJhdG9yVGVtcGxhdGVgIGlzIG5vdCBkZWZpbmVkXG4gIG9wdGlvbnMgPSBkZWZhdWx0cyh7fSwgb3B0aW9ucywgc2V0dGluZ3MpO1xuXG4gIHZhciBpbXBvcnRzID0gZGVmYXVsdHMoe30sIG9wdGlvbnMuaW1wb3J0cywgc2V0dGluZ3MuaW1wb3J0cyksXG4gICAgICBpbXBvcnRzS2V5cyA9IGtleXMoaW1wb3J0cyksXG4gICAgICBpbXBvcnRzVmFsdWVzID0gdmFsdWVzKGltcG9ydHMpO1xuXG4gIHZhciBpc0V2YWx1YXRpbmcsXG4gICAgICBpbmRleCA9IDAsXG4gICAgICBpbnRlcnBvbGF0ZSA9IG9wdGlvbnMuaW50ZXJwb2xhdGUgfHwgcmVOb01hdGNoLFxuICAgICAgc291cmNlID0gXCJfX3AgKz0gJ1wiO1xuXG4gIC8vIGNvbXBpbGUgdGhlIHJlZ2V4cCB0byBtYXRjaCBlYWNoIGRlbGltaXRlclxuICB2YXIgcmVEZWxpbWl0ZXJzID0gUmVnRXhwKFxuICAgIChvcHRpb25zLmVzY2FwZSB8fCByZU5vTWF0Y2gpLnNvdXJjZSArICd8JyArXG4gICAgaW50ZXJwb2xhdGUuc291cmNlICsgJ3wnICtcbiAgICAoaW50ZXJwb2xhdGUgPT09IHJlSW50ZXJwb2xhdGUgPyByZUVzVGVtcGxhdGUgOiByZU5vTWF0Y2gpLnNvdXJjZSArICd8JyArXG4gICAgKG9wdGlvbnMuZXZhbHVhdGUgfHwgcmVOb01hdGNoKS5zb3VyY2UgKyAnfCQnXG4gICwgJ2cnKTtcblxuICB0ZXh0LnJlcGxhY2UocmVEZWxpbWl0ZXJzLCBmdW5jdGlvbihtYXRjaCwgZXNjYXBlVmFsdWUsIGludGVycG9sYXRlVmFsdWUsIGVzVGVtcGxhdGVWYWx1ZSwgZXZhbHVhdGVWYWx1ZSwgb2Zmc2V0KSB7XG4gICAgaW50ZXJwb2xhdGVWYWx1ZSB8fCAoaW50ZXJwb2xhdGVWYWx1ZSA9IGVzVGVtcGxhdGVWYWx1ZSk7XG5cbiAgICAvLyBlc2NhcGUgY2hhcmFjdGVycyB0aGF0IGNhbm5vdCBiZSBpbmNsdWRlZCBpbiBzdHJpbmcgbGl0ZXJhbHNcbiAgICBzb3VyY2UgKz0gdGV4dC5zbGljZShpbmRleCwgb2Zmc2V0KS5yZXBsYWNlKHJlVW5lc2NhcGVkU3RyaW5nLCBlc2NhcGVTdHJpbmdDaGFyKTtcblxuICAgIC8vIHJlcGxhY2UgZGVsaW1pdGVycyB3aXRoIHNuaXBwZXRzXG4gICAgaWYgKGVzY2FwZVZhbHVlKSB7XG4gICAgICBzb3VyY2UgKz0gXCInICtcXG5fX2UoXCIgKyBlc2NhcGVWYWx1ZSArIFwiKSArXFxuJ1wiO1xuICAgIH1cbiAgICBpZiAoZXZhbHVhdGVWYWx1ZSkge1xuICAgICAgaXNFdmFsdWF0aW5nID0gdHJ1ZTtcbiAgICAgIHNvdXJjZSArPSBcIic7XFxuXCIgKyBldmFsdWF0ZVZhbHVlICsgXCI7XFxuX19wICs9ICdcIjtcbiAgICB9XG4gICAgaWYgKGludGVycG9sYXRlVmFsdWUpIHtcbiAgICAgIHNvdXJjZSArPSBcIicgK1xcbigoX190ID0gKFwiICsgaW50ZXJwb2xhdGVWYWx1ZSArIFwiKSkgPT0gbnVsbCA/ICcnIDogX190KSArXFxuJ1wiO1xuICAgIH1cbiAgICBpbmRleCA9IG9mZnNldCArIG1hdGNoLmxlbmd0aDtcblxuICAgIC8vIHRoZSBKUyBlbmdpbmUgZW1iZWRkZWQgaW4gQWRvYmUgcHJvZHVjdHMgcmVxdWlyZXMgcmV0dXJuaW5nIHRoZSBgbWF0Y2hgXG4gICAgLy8gc3RyaW5nIGluIG9yZGVyIHRvIHByb2R1Y2UgdGhlIGNvcnJlY3QgYG9mZnNldGAgdmFsdWVcbiAgICByZXR1cm4gbWF0Y2g7XG4gIH0pO1xuXG4gIHNvdXJjZSArPSBcIic7XFxuXCI7XG5cbiAgLy8gaWYgYHZhcmlhYmxlYCBpcyBub3Qgc3BlY2lmaWVkLCB3cmFwIGEgd2l0aC1zdGF0ZW1lbnQgYXJvdW5kIHRoZSBnZW5lcmF0ZWRcbiAgLy8gY29kZSB0byBhZGQgdGhlIGRhdGEgb2JqZWN0IHRvIHRoZSB0b3Agb2YgdGhlIHNjb3BlIGNoYWluXG4gIHZhciB2YXJpYWJsZSA9IG9wdGlvbnMudmFyaWFibGUsXG4gICAgICBoYXNWYXJpYWJsZSA9IHZhcmlhYmxlO1xuXG4gIGlmICghaGFzVmFyaWFibGUpIHtcbiAgICB2YXJpYWJsZSA9ICdvYmonO1xuICAgIHNvdXJjZSA9ICd3aXRoICgnICsgdmFyaWFibGUgKyAnKSB7XFxuJyArIHNvdXJjZSArICdcXG59XFxuJztcbiAgfVxuICAvLyBjbGVhbnVwIGNvZGUgYnkgc3RyaXBwaW5nIGVtcHR5IHN0cmluZ3NcbiAgc291cmNlID0gKGlzRXZhbHVhdGluZyA/IHNvdXJjZS5yZXBsYWNlKHJlRW1wdHlTdHJpbmdMZWFkaW5nLCAnJykgOiBzb3VyY2UpXG4gICAgLnJlcGxhY2UocmVFbXB0eVN0cmluZ01pZGRsZSwgJyQxJylcbiAgICAucmVwbGFjZShyZUVtcHR5U3RyaW5nVHJhaWxpbmcsICckMTsnKTtcblxuICAvLyBmcmFtZSBjb2RlIGFzIHRoZSBmdW5jdGlvbiBib2R5XG4gIHNvdXJjZSA9ICdmdW5jdGlvbignICsgdmFyaWFibGUgKyAnKSB7XFxuJyArXG4gICAgKGhhc1ZhcmlhYmxlID8gJycgOiB2YXJpYWJsZSArICcgfHwgKCcgKyB2YXJpYWJsZSArICcgPSB7fSk7XFxuJykgK1xuICAgIFwidmFyIF9fdCwgX19wID0gJycsIF9fZSA9IF8uZXNjYXBlXCIgK1xuICAgIChpc0V2YWx1YXRpbmdcbiAgICAgID8gJywgX19qID0gQXJyYXkucHJvdG90eXBlLmpvaW47XFxuJyArXG4gICAgICAgIFwiZnVuY3Rpb24gcHJpbnQoKSB7IF9fcCArPSBfX2ouY2FsbChhcmd1bWVudHMsICcnKSB9XFxuXCJcbiAgICAgIDogJztcXG4nXG4gICAgKSArXG4gICAgc291cmNlICtcbiAgICAncmV0dXJuIF9fcFxcbn0nO1xuXG4gIHRyeSB7XG4gICAgdmFyIHJlc3VsdCA9IEZ1bmN0aW9uKGltcG9ydHNLZXlzLCAncmV0dXJuICcgKyBzb3VyY2UgKS5hcHBseSh1bmRlZmluZWQsIGltcG9ydHNWYWx1ZXMpO1xuICB9IGNhdGNoKGUpIHtcbiAgICBlLnNvdXJjZSA9IHNvdXJjZTtcbiAgICB0aHJvdyBlO1xuICB9XG4gIGlmIChkYXRhKSB7XG4gICAgcmV0dXJuIHJlc3VsdChkYXRhKTtcbiAgfVxuICAvLyBwcm92aWRlIHRoZSBjb21waWxlZCBmdW5jdGlvbidzIHNvdXJjZSBieSBpdHMgYHRvU3RyaW5nYCBtZXRob2QsIGluXG4gIC8vIHN1cHBvcnRlZCBlbnZpcm9ubWVudHMsIG9yIHRoZSBgc291cmNlYCBwcm9wZXJ0eSBhcyBhIGNvbnZlbmllbmNlIGZvclxuICAvLyBpbmxpbmluZyBjb21waWxlZCB0ZW1wbGF0ZXMgZHVyaW5nIHRoZSBidWlsZCBwcm9jZXNzXG4gIHJlc3VsdC5zb3VyY2UgPSBzb3VyY2U7XG4gIHJldHVybiByZXN1bHQ7XG59XG5cbm1vZHVsZS5leHBvcnRzID0gdGVtcGxhdGU7XG4iLCIvKipcbiAqIExvLURhc2ggMi40LjEgKEN1c3RvbSBCdWlsZCkgPGh0dHA6Ly9sb2Rhc2guY29tLz5cbiAqIEJ1aWxkOiBgbG9kYXNoIG1vZHVsYXJpemUgbW9kZXJuIGV4cG9ydHM9XCJub2RlXCIgLW8gLi9tb2Rlcm4vYFxuICogQ29weXJpZ2h0IDIwMTItMjAxMyBUaGUgRG9qbyBGb3VuZGF0aW9uIDxodHRwOi8vZG9qb2ZvdW5kYXRpb24ub3JnLz5cbiAqIEJhc2VkIG9uIFVuZGVyc2NvcmUuanMgMS41LjIgPGh0dHA6Ly91bmRlcnNjb3JlanMub3JnL0xJQ0VOU0U+XG4gKiBDb3B5cmlnaHQgMjAwOS0yMDEzIEplcmVteSBBc2hrZW5hcywgRG9jdW1lbnRDbG91ZCBhbmQgSW52ZXN0aWdhdGl2ZSBSZXBvcnRlcnMgJiBFZGl0b3JzXG4gKiBBdmFpbGFibGUgdW5kZXIgTUlUIGxpY2Vuc2UgPGh0dHA6Ly9sb2Rhc2guY29tL2xpY2Vuc2U+XG4gKi9cbnZhciBlc2NhcGUgPSByZXF1aXJlKCcuL2VzY2FwZScpLFxuICAgIHJlSW50ZXJwb2xhdGUgPSByZXF1aXJlKCcuLi9pbnRlcm5hbHMvcmVJbnRlcnBvbGF0ZScpO1xuXG4vKipcbiAqIEJ5IGRlZmF1bHQsIHRoZSB0ZW1wbGF0ZSBkZWxpbWl0ZXJzIHVzZWQgYnkgTG8tRGFzaCBhcmUgc2ltaWxhciB0byB0aG9zZSBpblxuICogZW1iZWRkZWQgUnVieSAoRVJCKS4gQ2hhbmdlIHRoZSBmb2xsb3dpbmcgdGVtcGxhdGUgc2V0dGluZ3MgdG8gdXNlIGFsdGVybmF0aXZlXG4gKiBkZWxpbWl0ZXJzLlxuICpcbiAqIEBzdGF0aWNcbiAqIEBtZW1iZXJPZiBfXG4gKiBAdHlwZSBPYmplY3RcbiAqL1xudmFyIHRlbXBsYXRlU2V0dGluZ3MgPSB7XG5cbiAgLyoqXG4gICAqIFVzZWQgdG8gZGV0ZWN0IGBkYXRhYCBwcm9wZXJ0eSB2YWx1ZXMgdG8gYmUgSFRNTC1lc2NhcGVkLlxuICAgKlxuICAgKiBAbWVtYmVyT2YgXy50ZW1wbGF0ZVNldHRpbmdzXG4gICAqIEB0eXBlIFJlZ0V4cFxuICAgKi9cbiAgJ2VzY2FwZSc6IC88JS0oW1xcc1xcU10rPyklPi9nLFxuXG4gIC8qKlxuICAgKiBVc2VkIHRvIGRldGVjdCBjb2RlIHRvIGJlIGV2YWx1YXRlZC5cbiAgICpcbiAgICogQG1lbWJlck9mIF8udGVtcGxhdGVTZXR0aW5nc1xuICAgKiBAdHlwZSBSZWdFeHBcbiAgICovXG4gICdldmFsdWF0ZSc6IC88JShbXFxzXFxTXSs/KSU+L2csXG5cbiAgLyoqXG4gICAqIFVzZWQgdG8gZGV0ZWN0IGBkYXRhYCBwcm9wZXJ0eSB2YWx1ZXMgdG8gaW5qZWN0LlxuICAgKlxuICAgKiBAbWVtYmVyT2YgXy50ZW1wbGF0ZVNldHRpbmdzXG4gICAqIEB0eXBlIFJlZ0V4cFxuICAgKi9cbiAgJ2ludGVycG9sYXRlJzogcmVJbnRlcnBvbGF0ZSxcblxuICAvKipcbiAgICogVXNlZCB0byByZWZlcmVuY2UgdGhlIGRhdGEgb2JqZWN0IGluIHRoZSB0ZW1wbGF0ZSB0ZXh0LlxuICAgKlxuICAgKiBAbWVtYmVyT2YgXy50ZW1wbGF0ZVNldHRpbmdzXG4gICAqIEB0eXBlIHN0cmluZ1xuICAgKi9cbiAgJ3ZhcmlhYmxlJzogJycsXG5cbiAgLyoqXG4gICAqIFVzZWQgdG8gaW1wb3J0IHZhcmlhYmxlcyBpbnRvIHRoZSBjb21waWxlZCB0ZW1wbGF0ZS5cbiAgICpcbiAgICogQG1lbWJlck9mIF8udGVtcGxhdGVTZXR0aW5nc1xuICAgKiBAdHlwZSBPYmplY3RcbiAgICovXG4gICdpbXBvcnRzJzoge1xuXG4gICAgLyoqXG4gICAgICogQSByZWZlcmVuY2UgdG8gdGhlIGBsb2Rhc2hgIGZ1bmN0aW9uLlxuICAgICAqXG4gICAgICogQG1lbWJlck9mIF8udGVtcGxhdGVTZXR0aW5ncy5pbXBvcnRzXG4gICAgICogQHR5cGUgRnVuY3Rpb25cbiAgICAgKi9cbiAgICAnXyc6IHsgJ2VzY2FwZSc6IGVzY2FwZSB9XG4gIH1cbn07XG5cbm1vZHVsZS5leHBvcnRzID0gdGVtcGxhdGVTZXR0aW5ncztcbiIsIi8qKlxuICogTG8tRGFzaCAyLjQuMSAoQ3VzdG9tIEJ1aWxkKSA8aHR0cDovL2xvZGFzaC5jb20vPlxuICogQnVpbGQ6IGBsb2Rhc2ggbW9kdWxhcml6ZSBtb2Rlcm4gZXhwb3J0cz1cIm5vZGVcIiAtbyAuL21vZGVybi9gXG4gKiBDb3B5cmlnaHQgMjAxMi0yMDEzIFRoZSBEb2pvIEZvdW5kYXRpb24gPGh0dHA6Ly9kb2pvZm91bmRhdGlvbi5vcmcvPlxuICogQmFzZWQgb24gVW5kZXJzY29yZS5qcyAxLjUuMiA8aHR0cDovL3VuZGVyc2NvcmVqcy5vcmcvTElDRU5TRT5cbiAqIENvcHlyaWdodCAyMDA5LTIwMTMgSmVyZW15IEFzaGtlbmFzLCBEb2N1bWVudENsb3VkIGFuZCBJbnZlc3RpZ2F0aXZlIFJlcG9ydGVycyAmIEVkaXRvcnNcbiAqIEF2YWlsYWJsZSB1bmRlciBNSVQgbGljZW5zZSA8aHR0cDovL2xvZGFzaC5jb20vbGljZW5zZT5cbiAqL1xuXG4vKiogVXNlZCB0byBnZW5lcmF0ZSB1bmlxdWUgSURzICovXG52YXIgaWRDb3VudGVyID0gMDtcblxuLyoqXG4gKiBHZW5lcmF0ZXMgYSB1bmlxdWUgSUQuIElmIGBwcmVmaXhgIGlzIHByb3ZpZGVkIHRoZSBJRCB3aWxsIGJlIGFwcGVuZGVkIHRvIGl0LlxuICpcbiAqIEBzdGF0aWNcbiAqIEBtZW1iZXJPZiBfXG4gKiBAY2F0ZWdvcnkgVXRpbGl0aWVzXG4gKiBAcGFyYW0ge3N0cmluZ30gW3ByZWZpeF0gVGhlIHZhbHVlIHRvIHByZWZpeCB0aGUgSUQgd2l0aC5cbiAqIEByZXR1cm5zIHtzdHJpbmd9IFJldHVybnMgdGhlIHVuaXF1ZSBJRC5cbiAqIEBleGFtcGxlXG4gKlxuICogXy51bmlxdWVJZCgnY29udGFjdF8nKTtcbiAqIC8vID0+ICdjb250YWN0XzEwNCdcbiAqXG4gKiBfLnVuaXF1ZUlkKCk7XG4gKiAvLyA9PiAnMTA1J1xuICovXG5mdW5jdGlvbiB1bmlxdWVJZChwcmVmaXgpIHtcbiAgdmFyIGlkID0gKytpZENvdW50ZXI7XG4gIHJldHVybiBTdHJpbmcocHJlZml4ID09IG51bGwgPyAnJyA6IHByZWZpeCkgKyBpZDtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSB1bmlxdWVJZDtcbiJdfQ==
(3)
});
