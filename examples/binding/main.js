/* global sector, alert */

sector.Component.define({
  type: 'alerter',
  initialize: function () {
    this.subscribe('ui.alertRequested', function (msg) {
      alert(msg.data);
    });
  }
});

sector.Component.define({
  type: 'hello-world',
  ui: {
    form: 'form'
  },
  events: {
    'form submit': 'handleHelloSubmit'
  },
  binding: {
    'input[name=name]': 'name',
    'span.name': {
      path: 'name',
      format: function (value) {
        return '"' + value + '"';
      }
    }
  },
  initialize: function () {
    this.set('name', 'World');
  },
  handleHelloSubmit: function (event) {
    event.preventDefault();
    this.publish('ui.alertRequested', 'Hello ' + this.data.name);
  }
}, sector.mixins.View, sector.mixins.Bound);

sector.Component.define({
  type: 'animate-example',
  ui: {
    form: 'form.animate'
  },
  events: {
    'form submit': 'handleAnimateSubmit'
  },
  binding: {
    'input[name=startValue]': 'startValue',
    'input[name=endValue]': 'endValue',
    '.box': {
      path: 'currentValue',
      property: 'style.left',
      format: function (value) {
        return value + 'px';
      }
    }
  },
  initialize: function () {
    this.update({
      startValue: 0,
      endValue: 1000,
      currentValue: 0
    });
  },
  handleAnimateSubmit: function (event) {
    event.preventDefault();
    this.set('currentValue', this.data.startValue);
    sector.animate(this.data.startValue, this.data.endValue, {
      easing: 'easeInOut',
      step: function (progress, value) {
        this.set('currentValue', value);
      }
    }, this);
  }
}, sector.mixins.View, sector.mixins.Bound);

sector.init();