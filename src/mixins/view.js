
var View = sector.mixins.View = function () {
  var _templateCache = {};

  this.bindUI = function () {
    if (this.ui) {
      this._ui || ( this._ui = this.ui);
      var binding = _.result(this,'_ui');
      this.ui = {};
      _.forIn(binding, function (selector, key) {
        this.ui[key] = this.$(selector);
      }, this);
    }
  };

  this.bindEvents = function () {
    if (this.events) {
      _.forIn(this.events, function (func, event) {
        var parts = event.split('.', 2);
        this.stopListening(this.ui[parts[0]], parts[1]);
        this.listenTo(this.ui[parts[0]], parts[1], func);
      }, this);
    }
  };

  if (!_.has(this, 'render')) {
    this.render = function (data) {
      var html = '', source = '';
      if (this.template) {
        if (_.isFunction(this.template)) {
          html = this.template(data);
        } else {
          if (_.has(_templateCache, this.template)) {
            source = _templateCache[this.template];
          } else {
            source = sector.$(this.template).html();
            _templateCache[this.template] = source;
          }
          html = _.template(source, data);
        }
        this.$el.html(html);
      }
    };
  }

  this.remove = function () {
    this.$el.remove();
    this.destroy();
  };

  this.after('render', function () {
    this.bindUI();
    this.bindEvents();
  });

  this.before('initialize', function () {
    this.bindUI();
    this.bindEvents();
  });
};