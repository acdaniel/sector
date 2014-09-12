var utils = require('../utils');

var View = function View () {
  var _templateCache = {};

  this.setupUI = function () {
    if (this.ui) {
      this._ui || (this._ui = this.ui);
      var binding = utils.result(this, '_ui');
      this.ui = {};
      utils.forIn(binding, function (options, key) {
        if (utils.isString(options)) {
          options = {
            selector: options,
            all: false
          };
        }
        this.ui[key] = options.all ? this.selectAll(options.selector) : this.select(options.selector);
      }, this);
    }
  };

  this.teardownUI = function () {
    if (this.ui) {
      this._ui || (this._ui = this.ui);
      var binding = utils.result(this, '_ui');
      utils.forIn(binding, function (selector, key) {
        delete this.ui[key];
      }, this);
    }
  };

  this.setupEvents = function () {
    if (this.events) {
      utils.forIn(this.events, function (func, event) {
        var selector, el, type, spaceIndex = event.indexOf(' ');
        if (spaceIndex >= 0) {
          type = event.substr(0, event.indexOf(' '));
          selector = event.substr(event.indexOf(' ') + 1);
          if (selector[0] === '@') {
            el = this.ui[selector.substr(1)];
          } else {
            el = this.selectAll(selector);
          }
        } else {
          el = this.el;
          type = event;
        }
        this.listenTo(el, type, func);
      }, this);
    }
  };

  this.teardownEvents = function () {
    if (this.events) {
      utils.forIn(this.events, function (func, event) {
        var selector, el, type, spaceIndex = event.indexOf(' ');
        if (spaceIndex >= 0) {
          type = event.substr(0, event.indexOf(' '));
          selector = event.substr(event.indexOf(' ') + 1);
          if (selector[0] === '@') {
            el = this.ui[selector.substr(1)];
          } else {
            el = this.selectAll(selector);
          }
        } else {
          el = this.el;
          type = event;
        }
        this.stopListening(el, type);
      }, this);
    }
  };

  if (!utils.has(this, 'render')) {
    this.render = function (data) {
      var html = '', el, source = '';
      if (this.template) {
        if (this._isRendered) {
          this.teardownEvents();
          this.teardownUI();
        }
        if (utils.isFunction(this.template)) {
          html = this.template(data);
        } else {
          if (utils.has(_templateCache, this.template)) {
            source = _templateCache[this.template];
          } else {
            el = document.querySelector(this.template);
            if (!el) { throw Error('template ' + this.template + ' not found'); }
            source = el.innerHTML;
            _templateCache[this.template] = source;
          }
          html = utils.template(source, data || {});
        }
        this.el.innerHTML = html;
        this.setupUI();
        this.setupEvents();
        this._isRendered = true;
      }
    };
  }

  this.remove = function () {
    if (this.el && this.el.parentNode) {
      this.el.parentNode.removeChild(this.el);
    }
  };

  this.before('initialize', function () {
    if (this.el.children.length > 0) {
      this.setupUI();
      this.setupEvents();
    }
  });
};

module.exports = View;
