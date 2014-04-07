
exports.Component = require('./component');

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
  Hooked: require('./mixins/hooked'),
  Traceable: require('./mixins/traceable'),
  Listener: require('./mixins/listener'),
  PubSub: require('./mixins/pubsub'),
  View: require('./mixins/view'),
  Bound: require('./mixins/bound'),
  Validator: require('./mixins/validator')
};

exports.components = {};

exports.ext = {};

exports.utils = require('./utils');

exports.registry = require('./registry');