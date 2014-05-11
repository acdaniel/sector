var utils = require('../utils');

module.exports = function Bound () {

  this.defaults = utils.defaults({}, this.defaults, {
    data: null,
    binding: null
  });

  this.update = function (obj) {
    if (obj) {
      this.data = obj;
    }
    var traverse = function (obj, key) {
      var value;
      for (var name in obj) {
        value = obj[name];
        var newKey = key ? key + '.' + name : name;
        if ('object' === typeof value) {
          traverse(value, newKey);
        } else {
          this.setDOMValue(newKey, value);
        }
      }
    }.bind(this);
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
      this._keyBinding = this._keyBinding || {};
      utils.forIn(this.binding, function (binding, selector) {
        if (utils.isString(binding)) {
          binding = { key: binding };
        }
        var nodes, key = binding.key, events = binding.events || ['change'];
        if (selector === '$') {
          nodes = [this.el];
        } else if (this.ui && utils.has(this.ui, selector)) {
          if (utils.isString(this.ui[selector])) {
            throw new Error('Bound must be mixed in before View in order to use UI binding');
          }
          nodes = [this.ui[selector]];
        } else {
          nodes = [].slice.call(this.selectAll(selector));
        }
        nodes.forEach(function (node) {
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
        if (selector === '$') {
          nodes = [this.el];
        } else if (this.ui && utils.has(this.ui, selector)) {
          nodes = [this.ui[selector]];
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
    var nodes;
    if (utils.has(this._keyBinding, key)) {
      utils.forIn(this._keyBinding[key], function (binding) {
        if (binding.selector === '$') {
          nodes = [this.el];
        } else if (this.ui && utils.has(this.ui, binding.selector)) {
          nodes = [this.ui[binding.selector]];
        } else {
          nodes = [].slice.call(this.selectAll(binding.selector));
        }
        if (binding.format) {
          if (utils.isString(binding.format)) {
            binding.format = this[binding.format];
          }
          value = binding.format.call(this, value);
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
              node.checked = (value === true || value === 1 || value === 'true' || value === 'on');
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
