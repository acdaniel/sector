/* global sector, alert */
function Alertable () {

  this.clearAlerts = function () {
    var alerts = Array.prototype.slice.call(this.select('div.alert'));
    for (var i = alerts.length - 1; i >= 0; i--) {
      this.el.removeChild(alerts[i]);
    }
  };

  this.showAlert = function (msg) {
    var alert = sector.buildHtml({
      'div.alert': {
        '@': { style: 'height: 0; opacity: 0;' },
        'span': msg,
        'a.close': '&#735;'
      }
    }).firstChild;
    this.el.insertBefore(alert, this.el.firstChild);
    this.listenTo(alert, 'click:close', function (event) {
      event.preventDefault();
      if (event.target.className === 'close') {
        this.el.removeChild(alert);
      }
    });
    sector.animate(0, 1, {
      duration: 200,
      easing: 'easeOut',
      step: function (progress, value) {
        alert.style.height = value + 'em';
        alert.style.opacity = progress;
      }
    }, this);
  };

}

sector.Component.define({
  type: 'registration-form',
  ui: {
    firstName: 'input[name=firstName]',
    lastName: 'input[name=lastName]',
    email: 'input[name=email]'
  },
  events: {
    'submit': 'handleSubmit',
    'firstName change': 'handleChange',
    'firstName invalid': 'handleInvalid',
    'lastName invalid': 'handleInvalid',
    'email invalid': 'handleInvalid'
  },
  validation: {
    firstName: { required: true },
    lastName: { required: true },
    email: { email: true }
  },
  binding: {
    'input[name=firstName], span.firstName': {
      path: 'name.first',
      events: ['change', 'keyup']
    },
    'input[name=lastName], span.lastName': 'name.last',
    'input[name=email]': 'email'
  },
  handleSubmit: function (event) {
    event.preventDefault();
    this.clearAlerts();
    if (this.checkValidity()) {
      alert('SUCCESS: \n' + JSON.stringify(this.data));
    }
  },
  handleChange: function (event) {
    this.clearAlerts();
    if (!this.checkValidity(event.target.name)) {
      event.preventDefault();
    }
  },
  handleInvalid: function (event) {
    this.showAlert(event.target.name + ': ' + event.detail.message);
  }
}, sector.mixins.View, sector.mixins.Validator, sector.mixins.Bound, Alertable);

sector.init();