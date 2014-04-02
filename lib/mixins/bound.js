var utils = require('../utils');

module.exports = function Bound () {

  this.defaults = utils.defaults({}, this.defaults, {
    data: null,
    binding: null
  });

  var pathCache = {};

  var parsePath = function (key) {
    if (!pathCache[key]) {
      pathCache[key] = key.split('.');
    }
    return pathCache[key];
  };

  var normalizeKey = function (key) {
    var arrNotationRegex = /\[['"]?([_$a-zA-Z\xA0-\uFFFF][_$a-zA-Z0-9\xA0-\uFFFF]*)['"]?\]/g;
    var normalizedKey = key.replace(arrNotationRegex, function (match, p1) {
      return '.' + p1;
    });
    return normalizedKey;
  };

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
    var normalizedKey = normalizeKey(key);
    this.setDataValue(normalizedKey, value);
    this.setDOMValue(normalizedKey, value);
  };

  this.get = function (key) {
    var normalizedKey = normalizeKey(key);
    var path = parsePath(normalizedKey);
    return path.reduce(function (o, k) {
      return o[k];
    }, this.data);
  };

  this.bind = function () {
    if (this.binding) {
      utils.forIn(this.binding, function (binding, key) {
        var nodes = !binding.selector ? [this.el] : [].slice.call(this.select(binding.selector));
        var events = binding.events || ['change'];
        nodes.forEach(utils.bind(function (node, index) {
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
        }, this));
      }, this);
      this._isBound = true;
    }
  };

  this.unbind = function () {
    if (this.binding && this._isBound) {
      utils.forIn(this.binding, function (binding, key) {
        var nodes = !binding.selector ? [this.el] : [].slice.call(this.select(binding.selector));
        var events = binding.events || ['change'];
        nodes.forEach(utils.bind(function (node, index) {
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
    var binding, nodes;
    if (utils.has(this.binding, key)) {
      binding = this.binding[key];
      nodes = !binding.selector ? [this.el] : [].slice.call(this.select(binding.selector));
      // TODO format value
      nodes.forEach(function (node, index) {
        if (binding.property) {
          node[binding.property] = value;
        } else if (binding.attribute) {
          node.setAttribute(binding.attribute, value.toString());
        } else if (binding.html) {
          node.innerHTML = value.toString();
        } else if (node.tagName === 'INPUT' || node.tagName === 'SELECT' || node.tagName === 'TEXTAREA') {
          if (node.type.toLowerCase() === 'checkbox') {
            node.checked = !!value;
          } else if (node.type.toLowerCase() === 'radio') {
            node.checked = node.value === value.toString();
          } else {
            node.value = value.toString();
          }
        } else {
          node.textContent = value.toString();
        }
      });
    }
  };

  this.setDataValue = function (key, value) {
    var o = this.data, path = parsePath(key);
    for (var i = 0, l = path.length; i < l; i++) {
      if (i < l - 1) {
        if (!utils.has(o, path[i])) {
          o[path[i]] = {};
        }
        o = o[path[i]];
      } else {
        o[path[i]] = value;
      }
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
    if (this.binding) {
      var normalizedBinding = {};
      utils.forIn(this.binding, function (binding, key) {
        var normalizedKey = normalizeKey(key);
        normalizedBinding[normalizedKey] = utils.isString(binding) ? { selector: binding } : binding;
      });
      this.binding = normalizedBinding;
    }
    this.bind();
    this.update();
  });
};
