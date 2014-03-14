/**
 * sector v0.1.0
 * A component and pub/sub based UI framework for javascript applications.
 * https://github.com/acdaniel/sector
 *
 * Copyright 2014 Adam Daniel <adam@acdaniel.com>
 * Released under the MIT license
 *
 * Date: 2014-03-14T21:43:48.650Z
 */
(function(global, factory) {
  if (typeof define === 'function' && define.amd) {
    define(['lodash', 'jquery', 'exports'], function(_, $, exports) {
      global.sector = factory(global, exports, _, ($ || global.jQuery || global.$));
    });
  } else if (typeof exports !== 'undefined') {
    var _ = require('lodash'), $;
    try { $ = require('jquery'); } catch (e) { }
    factory(global, exports, _, ($ || global.jQuery || global.$));
  } else {
    global.sector = factory(global, {}, global._, (global.jQuery || global.$));
  }
}(this, function(global, sector, _, $) {

  sector.$ = $;

  // UTILS
  sector.utils = {
    define: function (properties /*, mixins... */) {
      var child, mixins = [], parent = this;
      if (properties && _.has(properties, 'constructor')) {
        child = properties.constructor;
      } else {
        child = function () { return parent.apply(this, arguments); };
      }
      child.prototype = _.create(parent.prototype, properties);
      _.extend(child, parent);
      _.bindAll(child);
      if (arguments.length > 1) {
        mixins = new Array(arguments.length - 1);
        for (var i = 1, l = mixins.length; i <= l; i++) {
          mixins[i - 1] = arguments[i];
        }
      }
      sector.utils.mixin.call(child.prototype, mixins);
      return child;
    },
    mixin: function (mixins) {
      if (!mixins) { return; }
      this._mixins = _.has(this, '_mixins') ? this._mixins : [];
      _.forEach(mixins, function (mixin) {
        if (this._mixins.indexOf(mixin) === -1) {
          mixin.call(this);
          this._mixins.push(mixin);
        }
      }, this);
    }
  };

  // MIXINS
  sector.mixins = {

    Hooked: function () {
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
        this[method] = _.wrap(oFunc, wrapFunc);
      };
    },

    Traceable: function () {
      if (!console) { return; }
      _.defaults(this.defaults, {debug: false});

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
    },

    Listener: function () {

      this.listenTo = function (/* el, event, selector, func */) {
        var self = this, argsLength = arguments.length,
            func = arguments[argsLength - 1],
            el, event, selector, sectorEvents;
        if (argsLength === 4) {
          el = arguments[0];
          event = arguments[1];
          selector = arguments[2];
        } else if ('object' === typeof arguments[0]) {
          el = arguments[0];
          event = arguments[1];
        } else if (argsLength === 2) {
          event = arguments[0];
        } else {
          event = arguments[0];
          selector = arguments[1];
        }
        if (el && !(el instanceof sector.$)) {
          el = this.$(el);
        } else if (!el) {
          el = this.$el;
        }
        event += '.' + this.id;
        func = _.isString(func) ? this[func] : func;
        sectorEvents = el.data('sectorEvents') ? el.data('sectorEvents') : [];
        el.data('sectorEvents', _.union(sectorEvents, [event]));
        this._listeningTo = this._listeningTo ? _.union(this._listeningTo, [el.selector]) : [el.selector];
        el.on('DOMNodeRemoved.' + this.id, function (event) {
          self.stopListening(sector.$(event.target));
          el.off('DOMNodeRemoved.' + this.id);
        });
        this.trace && this.trace('<+> ' + el.get() + '.' + event);
        el.on(event, selector, _.bind(function (event) {
          this.trace && this.trace('<- ' + event.target + '.' + event.type);
          func.apply(this, arguments);
        }, this));
      };

      this.stopListening = function (el, event, selector) {
        var argsLength = arguments.length, sectorEvents;
        if (argsLength === 2 && 'object' !== typeof el) {
          selector = event;
          event = el;
          el = undefined;
        }
        if (argsLength === 1 && 'object' !== typeof el) {
          event = el;
          el = undefined;
        }
        if (this.$ && el && !(el instanceof sector.$)) {
          el = this.$(el);
        } else if (this.$ && !el) {
          el = this.$el;
        }
        event += '.' + this.id;
        this.trace && this.trace('<x> ' + el.get() + '.' + event);
        el.off(event, selector);
        sectorEvents = el.data('sectorEvents') || [];
        _.remove(sectorEvents, function (value) {
          return value.indexOf(event, value.length - event.length) !== -1;
        });
        el.data('sectorEvents', sectorEvents);
        if (sectorEvents.length === 0) {
          el.data('sectorEvents', undefined);
          if (this._listeningTo) {
            _.remove(this._listeningTo, el.selector);
          }
        } else {
          el.data('sectorEvents', sectorEvents);
        }
      };

      this.before('destroy', function () {
        var self = this, event = '.' + this.id, sectorEvents;
        _.forEach(this._listeningTo, function (value) {
          var el = sector.$(value);
          el.off(event);
          sectorEvents = el.data('sectorEvents') || [];
          _.remove(sectorEvents, function (value) {
            return value.indexOf(event, value.length - event.length) !== -1;
          });
          delete self._listeningTo;
          el.data('sectorEvents', sectorEvents);
        });
      });
    },

    PubSub: function () {
      _.defaults(this.defaults, {trace: false});

      this.publish = function (topic, data) {
        this.trace && this.trace('=>> ' + topic , data);
        var doc = sector.$(this.$el.get(0).ownerDocument || this.$el);
        var event = 'pubsub.' + topic;
        doc.trigger(event, [data, this.id]);
      };

      this.subscribe = function (topic, func) {
        var self = this;
        if (!func) {
          func = topic;
          topic = undefined;
        }
        this.trace && this.trace('<<+>> ' + topic);
        var doc = sector.$(this.$el.get(0).ownerDocument || this.$el);
        var event = 'pubsub' + (topic ? '.' + topic : '');
        func = _.isString(func) ? this[func] : func;
        this.listenTo(doc, event, function (event, data, id) {
          this.trace && this.trace('<<= ' + topic, data);
          func.call(self, topic, data, id);
        });
      };

      this.unsubscribe = function (topic) {
        this.trace && this.trace('<<x>> ' + topic);
        var doc = sector.$(this.$el.get(0).ownerDocument || this.$el);
        var event = 'pubsub.' + topic;
        this.stopListening(doc, event);
      };
    },

    View: function () {
      var _templateCache = {};

      this.bindUI = function () {
        if (this.ui) {
          this._ui || ( this._ui = this.ui);
          var binding = _.result(this,'_ui');
          this.ui = {};
          _.forIn(binding, function (selector, key) {
            this.ui[key] = this.$(selector);
          }, this);
        }
      };

      this.bindEvents = function () {
        if (this.events) {
          _.forIn(this.events, function (func, event) {
            var parts = event.split('.', 2);
            this.stopListening(this.ui[parts[0]], parts[1]);
            this.listenTo(this.ui[parts[0]], parts[1], func);
          }, this);
        }
      };

      if (!_.has(this, 'render')) {
        this.render = function (data) {
          var html = '', source = '';
          if (this.template) {
            if (_.isFunction(this.template)) {
              html = this.template(data);
            } else {
              if (_.has(_templateCache, this.template)) {
                source = _templateCache[this.template];
              } else {
                source = sector.$(this.template).html();
                _templateCache[this.template] = source;
              }
              html = _.template(source, data);
            }
            this.$el.html(html);
          }
        };
      }

      this.remove = function () {
        this.$el.remove();
        this.destroy();
      };

      this.after('render', function () {
        this.bindUI();
        this.bindEvents();
      });

      this.before('initialize', function () {
        this.bindUI();
        this.bindEvents();
      });
    }
  };

// REGISTRY
  var Registry = sector.Registry = function () {
    this.components = {};
    this.instances = {};
    this.instancesAll = {};
  };

  Registry.prototype.addComponent = function (component) {
    var type = component.prototype.type;
    if (this.components[type]) {
      throw new Error('a component with type ' + type + ' is already defined');
    }
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
    var type = _.isString(component) ? component : component.type;
    return _.values(this.instances[type]) || null;
  };

  Registry.prototype.removeComponent = function (component) {
    var type = _.isString(component) ? component : component.type;
    delete this.components[type];
  };

  Registry.prototype.removeInstance = function (instance) {
    var id = _.isString(instance) ? instance : instance.id;
    instance = this.instancesAll[id];
    delete this.instancesAll[id];
    delete this.instances[instance.type][id];
  };

  Registry.prototype.removeInstancesOf = function (component) {
    var type = _.isString(component) ? component : component.type;
    var instances = this.instances[type];
    for (var id in instances) {
      delete this.instancesAll[id];
    }
    delete this.instances[type];
  };

  sector.registry = new Registry();

  // COMPONENT
  var Component = sector.Component = function (options) {
    var initOptions = _.omit(options, 'el');
    var specialOptions = _.pick(options, 'el');
    var defaults = _.result(this, 'defaults');
    var props = _.pick(initOptions, function (value, key) {
      return _.has(defaults, key) || key === 'id';
    });
    _.defaults(this, props, defaults);
    if (!this.id) {
      this.id = _.uniqueId('i');
    }
    if (_.has(specialOptions, 'el')) {
      if ('undefined' === typeof sector.$) {
        throw new Error('sector.$ not set to a valid jQuery instance');
      }
      this.$el = sector.$(specialOptions.el);
      this.$ = _.bind(this.$el.find, this.$el);
      this.after('destroy', function () {
        delete this.$el;
        delete this.$;
      });
    }
    sector.registry.addInstance(this);
    this.initialize.call(this, initOptions);
  };

  Component.prototype.toString = function () {
    return '[' + this.type + ' ' + this.id + ']';
  };

  Component.prototype.defaults = {};

  Component.prototype.initialize = _.noop;

  Component.prototype.destroy = _.noop;

  Component.define = function (properties /*, mixins... */) {
    var args, comp;
    if (!properties.type) {
      properties.type = _.uniqueId('c');
    }
    args = Array.prototype.slice.call(arguments, 1);
    args.unshift(
      properties, sector.mixins.Hooked, sector.mixins.Traceable,
      sector.mixins.Listener, sector.mixins.PubSub
    );
    comp = sector.utils.define.apply(this, args);
    sector.registry.addComponent(comp);
    return comp;
  };

  Component.attachTo = function (selector, options, oneInstance) {
    var self = this, instance;
    options = options || {};
    oneInstance = !!oneInstance;
    if (oneInstance) {
      options.el = selector;
      instance = new this(options);
    } else {
      var self = this;
      sector.$(selector).each(function () {
        options.el = this;
        instance = new self(options);
      });
    }
  };

  Component.destroyAll = function () {
    var instances = sector.registry.findInstancesOf(this.prototype.type);
    for (var i = 0, l = instances.length; i < l; i++) {
      instances[i].destroy();
      sector.registry.removeInstance(instances[i]);
    }
  };

  return sector;

}));