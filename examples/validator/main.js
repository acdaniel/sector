/* global sector, alert */

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
    'name.first': {
      selector: 'input[name=firstName], span.firstName',
      events: ['change', 'keyup']
    },
    'name.last': 'input[name=lastName], span.lastName',
    'email': 'input[name=email]'
  },
  handleSubmit: function (event) {
    event.preventDefault();
    if (this.checkValidity()) {
      alert('SUCCESS: \n' + JSON.stringify(this.data));
    }
  },
  handleChange: function (event) {
    if (!this.checkValidity(event.target.name)) {
      event.preventDefault();
    }
  },
  handleInvalid: function (event) {
    alert('ERROR ' + event.target.name + ':\n' + event.detail.message);
  }
}, sector.mixins.View, sector.mixins.Validator, sector.mixins.Bound);

sector.init();