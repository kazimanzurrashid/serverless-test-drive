exports.aws = {
  region: 'us-east-1',
  mainStackName: 'server-less-test-drive-main',
  bucketsStackName: 'server-less-test-drive-buckets',
  lambdaBucket: 'server-less-test-drive-lambda',
  siteBucket: 'server-less-test-drive-site',
  deploymentStageName: 'dev'
};

exports.paths = {
  lambdaDirectory: './lambda',
  cloudformationDirectory: './cloudformation',
  clientDirectory: './client',
  tempDirectory: './.tmp'
};
