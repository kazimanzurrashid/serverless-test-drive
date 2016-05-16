# Server-less Test Drive
Is a small prototype that demonstrate how different services of AWS can be used
to create server-less application. The application uses:

1. DynamoDB
2. Lambda
3. API Gateway
4. Cloudformation

## Background
In terms of feature you add work and count it, there are only two dynamodb
tables, when a word is added it uses a lambda function to update the count of
the other table. The other two lambda functions are exposed by API Gateway for
client applications. The cloud formation template is responsible to setup
everything and Gulp is used as task runner.

## Setup
1. Make sure you have node installed.
2. Clone the repo.
3. Run `npm install`.
4. Open the `config.js` and the change the `s3` bucket to something unique.
5. And finally `gulp run`, a new browser window will appear where you can add
and count words but, prior that you have to do the one last thing.
6. Login to AWS console and go to API Gateway and deploy the api with a name
**dev**, as it turns out when deploying from cloudformation, it is throwing
some nonsensical error message.