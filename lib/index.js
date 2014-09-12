
exports.Component = require('./component');

exports.init = function (options, cb) {
  options = options || {};
  exports.defaults(options, {
    root: document,
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
    var e = exports.createEvent('pubsub.' + topic,
      { topic: topic, data: data }
    );
    document.dispatchEvent(e);
  };
  exports.documentReady(function () {
    var nodes = [].slice.call(options.root.querySelectorAll(options.componentSelector));
    var componentCount = nodes.length;
    function finishInit () {
      if (cb) { cb(); }
      pub(options.readyTopic, {});
    }
    function deferedForEach (fn) {
      var arr = this, i = 0, l = this.length;
      function next () {
        if (i >= l) { return finishInit(); }
        fn(arr[i], i++);
        exports.defer(next);
      }
      next();
    }
    if (MutationObserver) {
      var observer = new MutationObserver(function(mutations) {
        mutations.forEach(function(mutation) {
          var node, instance;
          for (var i = 0, l = mutation.removedNodes.length; i < l; i++) {
            instance = null;
            node = mutation.removedNodes[i];
            if (node.id) {
              instance = exports.registry.findInstance(node.id);
              if (instance) {
                instance.destroy();
              } 
            }
          }
        });
      });
      observer.observe(document, { childList: true });
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
      el = (node.tagName.toLowerCase() === 'script') ? options.root : node;
      component = exports.registry.findComponent(type);
      if (component) {
        component.attachTo(el, componentOptions);
        if (!MutationObserver) {
          el.addEventListener('DOMNodeRemoved', function (event) {
            if (event.target === el) {
              el.removeEventListener('DOMNodeRemoved', this);
              component.destroy();
            }
          }, false);
        }
      } else if (!options.ignoreNotFound) {
        throw new Error('component ' + type + ' not found');
      }
    });
    if (!options.publishProgress) {
      finishInit();
    }
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

exports.registry = require('./registry');

var assign = require('lodash-node/modern/objects/assign');
assign(exports, require('./utils'));
