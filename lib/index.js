// Sector.js
// =========

// Exports the core mixins.
exports.mixins = {
  Hooked: require('./mixins/hooked'),
  Traceable: require('./mixins/traceable'),
  Listener: require('./mixins/listener'),
  PubSub: require('./mixins/pubsub'),
  View: require('./mixins/view')
};

// Exports the included components.
exports.components = {
  Router: require('./components/router')
};

// Exports for common utilities.
exports.utils = require('./utils');

// Export Component class, the basis for everything.
exports.Component = require('./component');

// Exports component registry instance.
exports.registry = require('./registry');

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