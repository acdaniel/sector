var utils = require('../utils');

var View = function () {
  var _templateCache = {};

  this.bindUI = function () {
    if (this.ui) {
      this._ui || ( this._ui = this.ui);
      var binding = utils.result(this,'_ui');
      this.trace('binding UI', binding);
      this.ui = {};
      utils.forIn(binding, function (selector, key) {
        this.ui[key] = this.select(selector, true);
      }, this);
    }
  };

  this.unbindUI = function () {
    if (this.ui) {
      this._ui || ( this._ui = this.ui);
      var binding = utils.result(this,'_ui');
      this.trace('unbinding UI', binding);
      utils.forIn(binding, function (selector, key) {
        delete this.ui[key];
      }, this);
    }
  };

  this.bindEvents = function () {
    if (this.events) {
      this.trace('binding events', this.events);
      utils.forIn(this.events, function (func, event) {
        var parts = event.split('.', 2);
        this.listenTo(this.ui[parts[0]], parts[1], func);
      }, this);
    }
  };

  this.unbindEvents = function () {
    if (this.events) {
      this.trace('unbinding events', this.events);
      utils.forIn(this.events, function (func, event) {
        var parts = event.split('.', 2);
        this.stopListening(this.ui[parts[0]], parts[1]);
      }, this);
    }
  };

  if (!utils.has(this, 'render')) {
    this.render = function (data) {
      var html = '', el, source = '';
      if (this.template) {
        if (utils.isFunction(this.template)) {
          html = this.template(data);
        } else {
          if (utils.has(_templateCache, this.template)) {
            source = _templateCache[this.template];
          } else {
            el = utils.selectOne(this.template);
            if (!el) { throw Error('template ' + this.template + ' not found'); }
            source = el.innerHTML;
            _templateCache[this.template] = source;
          }
          html = utils.template(source, data || {});
        }
        this.el.innerHTML = html;
      }
    };
  }

  this.remove = function () {
    this.el.parentNode.removeChild(this.el);
    this.destroy();
  };

  this.before('render', function () {
    this.unbindEvents();
    this.unbindUI();
  });

  this.after('render', function () {
    this.bindUI();
    this.bindEvents();
  });

  this.before('initialize', function () {
    this.bindUI();
    this.bindEvents();
  });
};

module.exports = View;