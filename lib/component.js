var utils = require('./utils'),
    registry = require('./registry'),
    Hooked = require('./mixins/hooked'),
    Traceable = require('./mixins/traceable'),
    Listener = require('./mixins/listener'),
    PubSub = require('./mixins/pubsub');

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