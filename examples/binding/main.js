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
  ui: { form: 'form' },
  events: {
    'form submit': 'handleSubmit'
  },
  binding: {
    'input[name=name]': 'name',
    'span.name': {
      path: 'name',
      formatter: function (value) {
        return '"' + value + '"';
      }
    }
  },
  initialize: function () {
    this.set('name', 'World');
  },
  handleSubmit: function (event) {
    event.preventDefault();
    this.publish('ui.alertRequested', 'Hello ' + this.data.name);
  }
}, sector.mixins.View, sector.mixins.Bound);

sector.init();