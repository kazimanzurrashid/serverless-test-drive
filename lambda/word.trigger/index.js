'use strict';

const AWS = require('aws-sdk');
const db = new AWS.DynamoDB.DocumentClient();

exports.handler = (event, context, callback) => {
  const words = event.Records
    .filter((record) => {
      return record.eventName === 'INSERT' || record.eventName === 'MODIFY';
    })
    .map((record) => {
      //noinspection JSUnresolvedVariable
      return record.dynamodb.Keys.word.S;
    });

  const wordsGroupByCount = (() => {
    const map = {};
    words.forEach((word) => {
      map[word] = (map[word] || 0) + 1;
    });
    return map;
  })();

  const upserts = Object.keys(wordsGroupByCount).map((key) => {
    const payload = {
      Key: {
        word: key
      },
      TableName: 'std_counts',
      UpdateExpression: 'add #c :v',
      ExpressionAttributeNames: {
        '#c': 'counts'
      },
      ExpressionAttributeValues: {
        ':v': wordsGroupByCount[key]
      },
      ReturnConsumedCapacity: 'NONE',
      ReturnItemCollectionMetrics: 'NONE',
      ReturnValues: 'NONE'
    };

    return new Promise((resolve, reject) => {
      db.update(payload, (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  });

  Promise.all(upserts).then(() => {
    callback();
  }, (errors) => {
    callback(errors);
  });
};
