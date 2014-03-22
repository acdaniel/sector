var utils = require('../utils');

module.exports = function () {

  this.listenTo = function (el, event, func) {
    if (!func) {
      func = event;
      event = el;
      el = this.el;
    }
    if (utils.isString(el)) {
      el = this.select(el);
    }
    func = utils.isString(func) ? this[func] : func;
    this._listeners = this._listeners || {};
    var removedListener = function (event) {
      var e = event.target;
      if (e !== el) { return; }
      var eid;
      if (e === window) {
        eid = 'window';
      } else if (e === window.document) {
        eid = 'document';
      } else if ('function' !== typeof e.getAttribute) {
        return;
      } else {
        eid = e.getAttribute('data-sector-eid');
      }
      if (this._listeners[eid]) {
        this.trace('element removed', el);
        this.stopListening(el);
      }
    };
    var createListener = function (event) {
      this.trace && this.trace('<- ' + event.target + '.' + event.type);
      func.apply(this, arguments);
    };
    if (!el) { return; }
    var eid;
    if (el === window) {
      eid = 'window';
    } else if (el === window.document) {
      eid = 'document';
    } else {
      eid = el.getAttribute('data-sector-eid');
    }
    if (!eid) {
      eid = utils.uniqueId('e');
      el.setAttribute('data-sector-eid', eid);
    }
    if (!this._listeners[eid]) {
      this._listeners[eid] = {};
      this._listeners[eid].DOMNodeRemoved = utils.bind(removedListener, this);
      el.addEventListener('DOMNodeRemoved', this._listeners[eid].DOMNodeRemoved, false);
    }
    if (this._listeners[eid][event]) {
      el.removeEventListener(event, this._listeners[eid][event], false);
    }
    this._listeners[eid][event] = utils.bind(createListener, this);
    this.trace && this.trace('<+> ' + el + '.' + event);
    el.addEventListener(event, this._listeners[eid][event], false);
  };

  this.stopListening = function (el, event) {
    if (!event && utils.isString(el)) {
      event = el;
      el = this.el;
    }
    if (utils.isString(el)) {
      el = this.select(el);
    }
    if (!el) { return; }
    var eid;
    if (el === window) {
      eid = 'window';
    } else if (el === window.document) {
      eid = 'document';
    } else {
      eid = el.getAttribute('data-sector-eid');
    }
    if (!this._listeners || !this._listeners[eid]) { return; }
    if (!event) {
      for (var ev in this._listeners[eid]) {
        this.trace && this.trace('<x> ' + el + '.' + ev);
        el.removeEventListener(ev, this._listeners[eid][ev]);
        delete this._listeners[eid][ev];
      }
    } else {
      if (event && !this._listeners[eid][event]) { return; }
      this.trace && this.trace('<x> ' + el + '.' + event);
      el.removeEventListener(event, this._listeners[eid][event]);
      delete this._listeners[eid][event];
    }
    if (this._listeners[eid].length === 0) {
      delete this._listeners[eid];
    }
  };

  this.before('destroy', function () {
    var el;
    for (var eid in this._listeners) {
      if (eid === 'window') {
        el = window;
      } else if (eid === 'document') {
        el = window.document;
      } else {
        el = window.document.querySelector('[data-sector-eid=' + eid + ']');
      }
      this.stopListening(el);
    }
  });
};