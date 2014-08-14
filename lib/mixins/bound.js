var utils = require('../utils');

module.exports = function Bound () {

  function traverse (obj, key, cb, thisArg) {
    var value;
    for (var name in obj) {
      value = obj[name];
      var newKey = key ? key + '.' + name : name;
      if ('object' === typeof value) {
        traverse(value, newKey, cb, thisArg);
      } else {
        cb.call(thisArg, newKey, value);
      }
    }
  }

  this.defaults = utils.defaults({}, this.defaults, {
    data: null,
    binding: null
  });

  this.update = function (obj) {
    if (obj) {
      var oldData = this.data;
      this.data = obj;
      var e = utils.createEvent('datachange', { oldValue: oldData, newValue: this.data });
      this.el.dispatchEvent(e);
    }
    traverse(this.data, '', this.setDOMValue, this);
  };

  this.readInput = function () {
    if (this.binding) {
      utils.forIn(this.binding, function (binding, selector) {
        if (utils.isString(binding)) {
          binding = { key: binding };
        }
        var nodes, key = binding.key;
        if (selector[0] === '@') {
          nodes = this.ui[selector.substr(1)];
          if (!Array.isArray(nodes) && !(nodes instanceof NodeList)) {
            nodes = [nodes];
          }
        } else if (selector === '$') {
          nodes = [this.el];
        } else {
          nodes = [].slice.call(this.selectAll(selector));
        }
        nodes.forEach(function (node) {
          if (node.tagName === 'INPUT' || node.tagName === 'SELECT' || node.tagName === 'TEXTAREA') {
            var value;
            if (node.type.toLowerCase() === 'checkbox') {
              value = node.checked;
            } else if (node.type.toLowerCase() === 'radio') {
              value = 'undefined' === typeof node.value ? 1 : node.value;
              value = node.checked ? value : undefined;
            } else {
              value = node.value;
            }
            this.set(key, value);
          }
        }.bind(this));
      }, this);
    }
  };

  this.reset = function () {
    if (this.binding) {
      this._keyBinding = this._keyBinding || {};
      utils.forIn(this.binding, function (binding, selector) {
        if (utils.isString(binding)) {
          binding = { key: binding };
        }
        var key = binding.key;
        this.setDOMValue(key, null);
      }, this);
    }
  };

  this.set = function (key, value) {
    if (!utils.isString(key)) {
      traverse(key, '', this.set, this);
    } else {
      this.setDataValue(key, value);
      this.setDOMValue(key, value);
    }
  };

  this.get = function (key) {
    return utils.getObjectPath(this.data, key);
  };

  this.bind = function () {
    if (this.binding) {
      this._keyBinding = this._keyBinding || {};
      utils.forIn(this.binding, function (binding, selector) {
        if (utils.isString(binding)) {
          binding = { key: binding };
        }
        var nodes, key = binding.key, events = binding.events || ['change'];
        if (selector[0] === '@') {
          nodes = this.ui[selector.substr(1)];
          if (!Array.isArray(nodes) && !(nodes instanceof NodeList)) {
            nodes = [nodes];
          }
        } else if (selector === '$') {
          nodes = [this.el];
        } else {
          nodes = [].slice.call(this.selectAll(selector));
        }
        nodes.forEach(function (node) {
          if (node.tagName === 'INPUT' || node.tagName === 'SELECT' || node.tagName === 'TEXTAREA') {
            utils.forIn(events, function (eventName) {
              this.listenTo(node, eventName + ':bound', function (event) {
                var value, el = event.target;
                if (el.type.toLowerCase() === 'checkbox') {
                  value = el.checked;
                } else if (el.type.toLowerCase() === 'radio') {
                  value = 'undefined' === typeof el.value ? 1 : el.value;
                  value = el.checked ? value : undefined;
                } else {
                  value = el.value;
                }
                this.set(key, value);
              });
            }, this);
          }
        }.bind(this));
        binding.selector = selector;
        this._keyBinding[key] = this._keyBinding[key] || [];
        this._keyBinding[key].push(binding);
      }, this);
      this._isBound = true;
    }
  };

  this.unbind = function () {
    if (this.binding && this._isBound) {
      this._keyBinding = {};
      utils.forIn(this.binding, function (binding, selector) {
        if (utils.isString(binding)) {
          binding = { key: binding };
        }
        var nodes, events = binding.events || ['change'];
        if (selector[0] === '@') {
          nodes = this.ui[selector.substr(1)];
          if (!Array.isArray(nodes) && !(nodes instanceof NodeList)) {
            nodes = [nodes];
          }
        } else if (selector === '$') {
          nodes = [this.el];
        } else {
          nodes = [].slice.call(this.selectAll(selector));
        }
        nodes.forEach(function (node) {
          if (node.tagName === 'INPUT' || node.tagName === 'SELECT' || node.tagName === 'TEXTAREA') {
            utils.forIn(events, function (eventName) {
              this.stopListening(node, eventName + ':bound');
            }, this);
          }
        }.bind(this));
      }, this);
    }
  };

  this.setDOMValue = function (key, value) {
    if (utils.has(this._keyBinding, key)) {
      utils.forIn(this._keyBinding[key], function (binding) {
        var nodes, domValue = utils.clone(value);
        if (binding.selector[0] === '@') {
          nodes = this.ui[binding.selector.substr(1)];
          if (!Array.isArray(nodes) && !(nodes instanceof NodeList)) {
            nodes = [nodes];
          }
        } else if (binding.selector === '$') {
          nodes = [this.el];
        } else {
          nodes = [].slice.call(this.selectAll(binding.selector));
        }
        if (binding.format) {
          if (utils.isString(binding.format)) {
            binding.format = this[binding.format];
          }
          domValue = binding.format.call(this, value);
        }
        nodes.forEach(function (node) {
          var currentValue, strValue = ('undefined' === typeof domValue  || domValue === null) ? '' : domValue.toString();
          if (binding.property) {
            utils.setObjectPath(node, binding.property, domValue);
          } else if (binding.attribute) {
            node.setAttribute(binding.attribute, strValue);
          } else if (binding.html) {
            node.innerHTML = strValue;
          } else if (node.tagName === 'INPUT' || node.tagName === 'SELECT' || node.tagName === 'TEXTAREA') {
            if (node.type.toLowerCase() === 'checkbox') {
              currentValue = node.checked;
              node.checked = (domValue === true || domValue === 1 || domValue === 'true' || domValue === 'on');
              if (currentValue !== node.checked) {
                node.dispatchEvent(utils.createEvent('change'));
              }
            } else if (node.type.toLowerCase() === 'radio') {
              currentValue = node.checked;
              node.checked = node.value === strValue;
              if (currentValue !== node.checked) {
                node.dispatchEvent(utils.createEvent('change'));
              }
            } else {
              currentValue = node.value;
              node.value = strValue;
              if (currentValue !== node.value) {
                node.dispatchEvent(utils.createEvent('change'));
              }
            }
          } else {
            node.textContent = strValue;
          }
        });
      }, this);
    }
  };

  this.setDataValue = function (key, value) {
    var e, oldValue = utils.getObjectPath(this.data, key);
    if (oldValue !== value) {
      utils.setObjectPath(this.data, key, value);
      e = utils.createEvent('datachange', { key: key, oldValue: oldValue, newValue: value });
      this.el.dispatchEvent(e);
    }
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
