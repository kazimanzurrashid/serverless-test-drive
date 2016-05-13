'use strict';

const AWS = require('aws-sdk');
const db = new AWS.DynamoDB.DocumentClient();

exports.handler = (event, context, callback) => {

  const payload = {
    TableName: 'std_words',
    Item: {
      'word': event.word,
      'timestamp': Date.UTC
    },
    ReturnConsumedCapacity: 'NONE',
    ReturnItemCollectionMetrics: 'NONE',
    ReturnValues: 'NONE'
  };
  
  db.put(payload, (err) => {
    callback(err);
  });
};
