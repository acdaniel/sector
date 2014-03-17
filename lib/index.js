
exports.Component = require('./component');
exports.utils = require('./utils');
exports.mixins = {
  Hooked: require('./mixins/hooked'),
  Traceable: require('./mixins/traceable'),
  Listener: require('./mixins/listener'),
  PubSub: require('./mixins/pubsub'),
  View: require('./mixins/view')
};
exports.components = {
  Router: require('./components/router')
};
exports.registry = require('./registry');
exports.ready = exports.utils.documentReady;
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
  exports.ready(function () {
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
      { topis: 'ui.ready', data: {} }
    );
    window.document.dispatchEvent(e);
  });
};