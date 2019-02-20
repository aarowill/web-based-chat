// Use this hook to manipulate incoming or outgoing data.
// For more information on hooks see: http://docs.feathersjs.com/api/hooks.html
const Errors = require('@feathersjs/errors');
const Joi = require('joi');

// eslint-disable-next-line no-unused-vars
module.exports = function (options = {}) {
  return async context => {
    const { data } = context;

    // Validate the message
    const schema = Joi.object().keys({
      text: Joi.string().min(1).max(400).required(),
    });

    const result = Joi.validate(data, schema);

    if (result !== null) {
      throw new Errors.Unprocessable('Invalid JSON data', result.error.details);
    }

    return context;
  };
};