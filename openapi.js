let components;

const getCommonProperties = (parameter) => {
  let commonProperties = '';
  if (parameter.required) {
    commonProperties += '.required()';
  }
  if ('description' in parameter) {
    commonProperties += `.description('${parameter.description}')`;
  }

  // check if there is a x-joi-add
  if (parameter['x-joi-add']) {
    commonProperties += parameter['x-joi-add'];
  }

  return commonProperties;
};

const getKeyText = (parameter, definition, addCommonProperties = true) => {
  const commonProperties = addCommonProperties ? getCommonProperties(parameter) : '';
  const isSimpleKeyName = parameter.name.match(/^\w+$/);
  const quoteSign = isSimpleKeyName ? '' : '\'';

  return `${quoteSign}${parameter.name}${quoteSign}: ${definition}${commonProperties},
    `;
};

const getKeyStringText = (parameter) => {
  let definition = 'Joi.string()';
  if (parameter.format === 'uuid' || (parameter.schema && parameter.schema.format === 'uuid')) {
    definition += '.guid()';
  } else if (parameter.format === 'email' || (parameter.schema && parameter.schema.format === 'email')) {
    definition += '.email()';
  } else if (parameter.format === 'uri' || (parameter.schema && parameter.schema.format === 'uri')) {
    definition += '.uri()';
  } else if (parameter.format === 'hostname' || (parameter.schema && parameter.schema.format === 'hostname')) {
    definition += '.hostname()';
  }

  if ('pattern' in parameter) {
    definition += `.regex(${parameter.pattern})`;
  }

  if ('enum' in parameter) {
    definition += `.valid('${parameter.enum.join('\', \'')}')`;
  }

  return getKeyText(parameter, definition);
};

const getCommonNumberText = (parameter) => {
  let definition = '';
  if ('minimum' in parameter) {
    definition += `.min(${parameter.minimum})`;
  }
  if ('maximum' in parameter) {
    definition += `.max(${parameter.maximum})`;
  }

  return definition;
};

const getKeyNumberText = (parameter) => {
  let definition = 'Joi.number()';

  definition += getCommonNumberText(parameter);

  return getKeyText(parameter, definition);
};

const getKeyIntegerText = (parameter) => {
  let definition = 'Joi.number().integer()';

  definition += getCommonNumberText(parameter);

  return getKeyText(parameter, definition);
};

const getKeyArrayText = (parameter) => {
  let definition = `Joi.array().items(
    `;
  if ('items' in parameter) {
    // eslint-disable-next-line no-use-before-define
    definition += getText(parameter.items);
  } else {
    throw Error('Array definition doesn\'t have items.');
  }

  definition += `
)`;

  return getKeyText(parameter, definition);
};

const getKeyObjectText = (parameter) => {
  let definition = `Joi.object().keys({
    `;
  if ('properties' in parameter) {
    Object.keys(parameter.properties).forEach((property) => {
      // eslint-disable-next-line no-use-before-define
      definition += `${getText(parameter.properties[property])},
      `;
    });
  } else {
    throw Error('Object definition doesn\'t have properties.');
  }

  definition = `${definition.trim().substr(0, definition.length - 1)}
})`;

  return getKeyText(parameter, definition);
};

const getKeyComponentText = (parameter) => {
  let definition = '';
  if ('properties' in parameter) {
    Object.keys(parameter.properties).forEach((propertyName) => {
      // eslint-disable-next-line no-use-before-define
      definition += `${getText({ ...parameter.properties[propertyName], name: propertyName })}`;
    });
  } else {
    throw Error('Object definition doesn\'t have properties.');
  }

  definition = `${definition.trim().substr(0, definition.length - 6)})`;

  return definition;
};

const findComponentByPath = (path) => {
  const componentName = path.replace('#/components/schemas/', '');

  if (!components.schemas[componentName]) {
    throw Error(`component ${componentName} not found.`);
  }
  return components.schemas[componentName];
};

const getText = (parameter) => {
  let text = '';

  // check if this is a component structure
  if (parameter.schema && parameter.schema.$ref) {
    const component = findComponentByPath(parameter.schema.$ref, components);

    return getKeyComponentText({ ...component, name: parameter.operationId });
  }

  // check if there is a x-joi-replace
  if (parameter['x-joi-replace']) {
    return getKeyText(parameter, parameter['x-joi-replace'], false);
  }

  const type = parameter.schema ? parameter.schema.type : parameter.type;

  switch (type) {
    case 'string':
      text = getKeyStringText(parameter);
      break;
    case 'integer':
      text = getKeyIntegerText(parameter);
      break;
    case 'number':
      text = getKeyNumberText(parameter);
      break;
    case 'array':
      text = getKeyArrayText(parameter);
      break;
    case 'object':
      text = getKeyObjectText(parameter);
      break;
    default:
      throw new Error(`Unexpected parameter type ${parameter.schema.type} in parameter named ${parameter.name}.`);
  }

  return text;
};

const getRequestBodyText = (route) => {
  const { requestBody, operationId, description } = route;
  if (requestBody.content && requestBody.content['application/json']) {
    return getText({ ...requestBody.content['application/json'], operationId, description }, components);
  }
};

const parse = (route, componentsParam) => {
  if (!route) throw new Error('No route was passed.');

  components = componentsParam;

  let pathJoi = '';
  let queryJoi = '';
  let bodyJoi = '';

  if (route.parameters) {
    route.parameters.forEach((parameter) => {
      const keyText = getText(parameter);

      if (parameter.in === 'path') pathJoi += keyText;
      else if (parameter.in === 'query') queryJoi += keyText;
    });
  }

  if (route.requestBody) {
    bodyJoi += getRequestBodyText(route);
  }

  const rObject = {};

  if (queryJoi.length > 0) {
    rObject.query = `Joi.object().keys({
    ${queryJoi.substr(0, queryJoi.length - 6)}
  })`;
  }

  if (pathJoi.length > 0) {
    rObject.path = `Joi.object().keys({
    ${pathJoi.substr(0, pathJoi.length - 6)}
  })`;
  }

  if (bodyJoi.length > 0) {
    rObject.body = `Joi.object().keys({
    ${bodyJoi.substr(0, bodyJoi.length - 1)}
  })`;
  }

  return rObject;
};

module.exports = parse;
exports.default = parse;
