'use strict';

const AWS = require('aws-sdk');
const db = new AWS.DynamoDB.DocumentClient();

exports.handler = (event, context, callback) => {

  const payload = {
    TableName: 'std_counts',
    Key: {
      'word': event.word
    },
    ProjectionExpression: 'counts',
    ConsistentRead: false,
    ReturnConsumedCapacity: 'NONE'
  };

  db.get(payload, (err, result) => {
    callback(err, result && (result.Item || {counts: 0}));
  });
};
