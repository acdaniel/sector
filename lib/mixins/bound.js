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
