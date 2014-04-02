var utils = require('../utils');

var View = function View () {
  var _templateCache = {};

  this.setupUI = function () {
    if (this.ui) {
      this._ui || ( this._ui = this.ui);
      var binding = utils.result(this, '_ui');
      this.ui = {};
      utils.forIn(binding, function (selector, key) {
        this.ui[key] = this.select(selector, true);
      }, this);
    }
  };

  this.teardownUI = function () {
    if (this.ui) {
      this._ui || ( this._ui = this.ui);
      var binding = utils.result(this, '_ui');
      utils.forIn(binding, function (selector, key) {
        delete this.ui[key];
      }, this);
    }
  };

  this.setupEvents = function () {
    if (this.events) {
      utils.forIn(this.events, function (func, event) {
        var el, type, parts = event.split(/[. ]+/, 2);
        if (parts.length === 1) {
          el = this.el;
          type = parts[0];
        } else {
          el = this.ui[parts[0]];
          type = parts[1];
        }
        this.listenTo(el, type, func);
      }, this);
    }
  };

  this.teardownEvents = function () {
    if (this.events) {
      utils.forIn(this.events, function (func, event) {
        var el, type, parts = event.split(/[. ]+/, 2);
        if (parts.length === 1) {
          el = this.el;
          type = parts[0];
        } else {
          el = this.ui[parts[0]];
          type = parts[1];
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
            el = window.document.querySelector(this.template);
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
    this.el.parentNode.removeChild(this.el);
  };

  this.before('initialize', function () {
    if (this.el.children.length > 0) {
      this.setupUI();
      this.setupEvents();
    }
  });
};

module.exports = View;