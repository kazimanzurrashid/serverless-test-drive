# Server-less Test Drive
Is a small prototype that demonstrate how different services of AWS can be used
to create server-less application. The application uses:

1. DynamoDB
2. Lambda
3. API Gateway
4. S3
5. Cloudformation

## Background
In terms of feature, you can add word and count it, there are only two dynamodb
tables, when a word is added it uses a lambda function to update the count of
the other table. The other two lambda functions are exposed by API Gateway for
client application. The cloud formation templates are responsible to setup
everything and Gulp is used as task runner.

## Setup
1. Make sure you have node installed.
2. Clone the repo.
3. Open the `config.js` and the change the `s3` buckets to something
unique.
3. In the command prompt run `npm install`.
4. And then run `gulp`, a new browser window will appear where you can add
and count words.

And that is it.
