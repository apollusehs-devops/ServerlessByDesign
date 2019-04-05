"use strict";

const jsyaml = require('js-yaml');

const runtimes = {
  "nodejs8.10": {
    fileExtension: "js",
    gitignore: `# package directories
node_modules
jspm_packages

# Serverless directories
.serverless
`,
    handler: "handler",
    startingCode:
    `'use strict';

module.exports.handler = (event, context, callback) => {
  const response = {
    statusCode: 200,
    body: JSON.stringify({
      message: 'Go Serverless v1.0! Your function executed successfully!',
      input: event,
    }),
  };

  callback(null, response);

  // Use this code if you don't use the http event with the LAMBDA-PROXY integration
  // callback(null, { message: 'Go Serverless v1.0! Your function executed successfully!', event });
};
`
  },
  "python3.7": {
    fileExtension: "py",
    gitignore: `# Distribution / packaging
.Python
env/
build/
develop-eggs/
dist/
downloads/
eggs/
.eggs/
lib/
lib64/
parts/
sdist/
var/
*.egg-info/
.installed.cfg
*.egg

# Serverless directories
.serverless
`,
    handler: "handler",
    startingCode:
    `import json

def handler(event, context):
    body = {
        "message": "Go Serverless v1.0! Your function executed successfully!",
        "input": event
    }

    response = {
        "statusCode": 200,
        "body": json.dumps(body)
    }

    return response

    # Use this code if you don't use the http event with the LAMBDA-PROXY integration
    """
    return {
        "message": "Go Serverless v1.0! Your function executed successfully!",
        "event": event
    }
    """
`
  }
};

var renderingRules = {
  bucket: {
    resource: function (status, node) {
      status.template.resources.Resources[node.id] = {
        Type: "AWS::S3::Bucket"
      };
    },
    event: function (status, id, idFrom) {
      if (status.model.nodes[id].type === 'fn') {
        status.template.functions[id].events.push({
          s3: {
            bucket: idFrom,
            event: "s3:ObjectCreated:*"
          }
        });
      } else {
        status.template.resources.Resources[id].Properties.Events['Bucket' + idFrom] = {
          Type: "S3",
          Properties: {
            Bucket: { Ref: idFrom },
            Events: "s3:ObjectCreated:*"
          }
        };

        // To avoid circular dependencies with a more specific policy 
        status.template.resources.Resources[id].Properties.Policies.push('AmazonS3ReadOnlyAccess');
      }
    },
    policy: function (status, id, idTo) {
      return {
        Effect: "Allow",
        Action: ["s3:GetObject", "s3:PutObject"],
        Resource: {
          "Fn::Join": [
            "",
            [
              { "Fn::GetAtt": [idTo, "Arn"] },
              "/*"
            ]
          ]
        }
      };
    },
  },
  table: {
    resource: function (status, node) {
      status.template.resources.Resources[node.id] = {
        Type: "AWS::DynamoDB::Table",
        Properties: {
          AttributeDefinitions: [
            {
              AttributeName: "id",
              AttributeType: "S"
            },
            {
              AttributeName: "version",
              AttributeType: "N"
            }
          ],
          KeySchema: [
            {
              AttributeName: "id",
              KeyType: "HASH"
            },
            {
              AttributeName: "version",
              KeyType: "RANGE"
            }
          ],
          BillingMode: 'PAY_PER_REQUEST',
          StreamSpecification: {
            StreamViewType: "NEW_AND_OLD_IMAGES"
          }
        }
      };
    },
    event: function (status, id, idFrom) {
      if (status.model.nodes[id].type === 'fn') {
        status.template.functions[id].events.push({
          stream: {
            type: "dynamodb",
            arn: { "Fn::GetAtt": [idFrom, "StreamArn"] }
          }
        });
      } else { 
        status.template.resources.Resources[id].Properties.Events['Table' + idFrom] = {
          Type: "DynamoDB",
          Properties: {
            Stream: { "Fn::GetAtt": [idFrom, "StreamArn"] },
            StartingPosition: "TRIM_HORIZON",
            BatchSize: 10
          }
        };
      }
    },
    policy: function (status, id, idTo) {
      return {
        Effect: "Allow",
        Action: ["dynamodb:GetItem", "dynamodb:PutItem"],
        Resource: { "Fn::GetAtt": [idTo, "Arn"] }
      };
    },
  },
  api: {
    resource: function (status, node) {
      // Nothing to do, created by the API event
    },
    event: function (status, id, idFrom) {
      if (status.model.nodes[id].type === 'fn') {
        status.template.functions[id].events.push({
          http: {
            path: "/{proxy+}",
            method: "get"
          }
        });
      } else { // Currently this doesn't execute but could if Step Functions handled events
        status.template.resources.Resources[id].Properties.Events['Api' + idFrom] = {
          Type: "Api",
          Properties: {
            Path: "/{proxy+}",
            Method: "ANY"
          }
        };
      }
    },
    policy: function (status, id, idTo) {
      return {
        Effect: "Allow",
        Action: "execute-api:Invoke",
        Resource: {
          "Fn::Join": [
            "",
            [
              "arn:aws:execute-api:",
              { Ref: "AWS::Region" },
              ":",
              { Ref: "AWS::AccountId" },
              ":*/*/*/*"
            ]
          ]
        }
      };
    },
  },
  stream: {
    resource: function (status, node) {
      status.template.resources.Resources[node.id] = {
        Type: "AWS::Kinesis::Stream",
        Properties: {
          ShardCount: 1
        }
      };
    },
    event: function (status, id, idFrom) {
      if (status.model.nodes[id].type === 'fn') {
        status.template.functions[id].events.push({
          stream: {
            type: "kinesis",
            arn: { "Fn::GetAtt": [idFrom, "Arn"] }
          }
        });
      } else {
        status.template.resources.Resources[id].Properties.Events['Stream' + idFrom] = {
          Type: "Kinesis",
          Properties: {
            Stream: { "Fn::GetAtt": [idFrom, "Arn"] },
            StartingPosition: "TRIM_HORIZON",
            BatchSize: 10
          }
        };
      }      
    },
    policy: function (status, id, idTo) {
      return {
        Effect: "Allow",
        Action: ["kinesis:PutRecord", "kinesis:PutRecords"],
        Resource: { "Fn::GetAtt": [idTo, "Arn"] }
      };
    },
  },
  deliveryStream: {
    resource: function (status, node) {
      var targetBucketId = null;
      var targetFnId = null;
      node.to.forEach(function (idTo) {  // Target resources
        var node_to = status.model.nodes[idTo];
        if (node_to.type === 'bucket') {
          targetBucketId = idTo;
        } else if (node_to.type === 'fn') {
          targetFnId = idTo;
        }
      });
      if (targetBucketId == null) {
        console.error("Delivery Stream without a destination");
        return;
      }
      var deliveryPolicyId = node.id + "DeliveryPolicy";
      var deliveryRoleId = node.id + "DeliveryRole";
      // Create the Delivery Strem
      status.template.resources.Resources[node.id] = {
        DependsOn: [deliveryPolicyId],
        Type: 'AWS::KinesisFirehose::DeliveryStream',
        Properties: {
          ExtendedS3DestinationConfiguration: {
            BucketARN: { "Fn::GetAtt": [targetBucketId, "Arn"] },
            BufferingHints: {
              IntervalInSeconds: 60,
              SizeInMBs: 50
            },
            CompressionFormat: "UNCOMPRESSED",
            Prefix: "firehose/",
            RoleARN: { "Fn::GetAtt": [deliveryRoleId, "Arn"] }
          }
        }
      };
      if (targetFnId !== null) {
        status.template.resources.Resources[node.id].Properties
          .ExtendedS3DestinationConfiguration.ProcessingConfiguration = {
            Enabled: true,
            Processors: [{
              Parameters: [{
                ParameterName: "LambdaArn",
                ParameterValue: { Ref: `${targetFnId}LambdaFunction` },
              }],
              Type: "Lambda"
            }]
          };
      }
      // Create a delivery role
      status.template.resources.Resources[deliveryRoleId] = {
        Type: 'AWS::IAM::Role',
        Properties: {
          AssumeRolePolicyDocument: {
            Version: '2012-10-17',
            Statement: [{
              Effect: "Allow",
              Principal: { Service: "firehose.amazonaws.com" },
              Action: 'sts:AssumeRole',
              Condition: {
                StringEquals: {
                  'sts:ExternalId': { Ref: "AWS::AccountId" }
                }
              }
            }]
          }
        }
      };
      // Create a delivery policy for the role
      status.template.resources.Resources[deliveryPolicyId] = {
        Type: 'AWS::IAM::Policy',
        Properties: {
          PolicyName: "firehose_delivery_policy",
          PolicyDocument: {
            Version: '2012-10-17',
            Statement: [{
              Effect: 'Allow',
              Action: [
                's3:AbortMultipartUpload',
                's3:GetBucketLocation',
                's3:GetObject',
                's3:ListBucket',
                's3:ListBucketMultipartUploads',
                's3:PutObject'
              ],
              Resource: {
                "Fn::GetAtt": [targetBucketId, "Arn"]
              }
            }]
          },
          Roles: [{ Ref: deliveryRoleId }]
        }
      };
    },
    event: function () { }, // TODO
    policy: function (status, id, idTo) {
      return {
        Effect: "Allow",
        Action: [
          "firehose:PutRecord",
          "firehose:PutRecordBatch"
        ],
        // Kinesis Firehose ARN syntax (can't use GetAtt)
        // arn:aws:firehose:region:account-id:deliverystream/delivery-stream-name
        Resource: {
          "Fn::Join": [
            "", 
            [ 
              "arn:aws:firehose:", 
              { Ref: "AWS::Region" },
              ":",
              { Ref: "AWS::AccountId" },
              `:deliverystream/${idTo}`
            ]
          ]
        }
      };
    },
  },
  analyticsStream: {
    resource: function (status, node) {

      // Input resources
      var inputStreamId = null;
      var inputDeliveryStreamId = null;
      node.from.forEach(function (idFrom) {
        var node_from = status.model.nodes[idFrom];
        if (node_from.type === 'stream') {
          inputStreamId = idFrom;
        } else if (node_from.type === 'deliveryStream') {
          inputDeliveryStreamId = idFrom;
        }
      });

      // Output resource
      var outputStreamId = null;
      var outputDeliveryStreamId = null;
      node.to.forEach(function (idTo) {
        var node_to = status.model.nodes[idTo];
        if (node_to.type === 'stream') {
          outputStreamId = idTo;
        } else if (node_to.type === 'deliveryStream') {
          outputDeliveryStreamId = idTo;
        }
      });

      var analyticsStreamRoleId = node.id + "Role";
      var analyticsStreamOutputId = node.id + "Outputs";

      status.template.resources.Resources[node.id] = {
        Type: "AWS::KinesisAnalytics::Application",
        Properties: {
          ApplicationName: node.id,
          Inputs: [{
            NamePrefix: "exampleNamePrefix",
            InputSchema: {
              RecordColumns: [{
                Name: "example",
                SqlType: "VARCHAR(16)",
                Mapping: "$.example"
              }],
              RecordFormat: {
                RecordFormatType: "JSON",
                MappingParameters: {
                  JSONMappingParameters: {
                    RecordRowPath: "$"
                  }
                }
              }
            }
          }]
        }
      };

      if (node.description !== '') {
        status.template.resources.Resources[node.id]
          .Properties.ApplicationDescription = node.description;
      }

      if (inputStreamId !== null) {
        status.template.resources.Resources[node.id]
          .Properties.Inputs[0].KinesisStreamsInput = {
            ResourceARN: { "Fn::GetAtt": [inputStreamId, "Arn"] },
            RoleARN: { "Fn::GetAtt": [analyticsStreamRoleId, "Arn"] }
          };
      }

      if (inputDeliveryStreamId !== null) {
        status.template.resources.Resources[node.id]
          .Properties.Inputs[0].KinesisFirehoseInput = {
            // Kinesis Firehose ARN syntax (can't use GetAtt)
            // arn:aws:firehose:region:account-id:deliverystream/delivery-stream-name
            ResourceARN: {
              "Fn::Join": [
                "", 
                [ 
                  "arn:aws:firehose:", 
                  { Ref: "AWS::Region" },
                  ":",
                  { Ref: "AWS::AccountId" },
                  `:deliverystream/${inputDeliveryStreamId}`
                ]
              ]
            },
            RoleARN: { "Fn::GetAtt": [analyticsStreamRoleId, "Arn"] }
          };
      }

      status.template.resources.Resources[analyticsStreamRoleId] = {
        Type: "AWS::IAM::Role",
        Properties: {
          AssumeRolePolicyDocument: {
            Version: "2012-10-17",
            Statement: [{
              Effect: "Allow",
              Principal: {
                Service: "kinesisanalytics.amazonaws.com"
              },
              Action: "sts:AssumeRole"
            }]
          },
          Path: "/",
          Policies: [{
            PolicyName: "Open",
            PolicyDocument: {
              Version: "2012-10-17",
              Statement: [{
                Effect: "Allow",
                Action: "*",
                Resource: "*"
              }]
            }
          }]
        }
      };

      status.template.resources.Resources[analyticsStreamOutputId] = {
        Type: "AWS::KinesisAnalytics::ApplicationOutput",
        DependsOn: node.id,
        Properties: {
          ApplicationName: { Ref: node.id },
          Output: {
            Name: "exampleOutput",
            DestinationSchema: {
              RecordFormatType: "CSV"
            }
          }
        }
      };

      if (outputStreamId !== null) {
        status.template.resources.Resources[analyticsStreamOutputId]
          .Properties.Output.KinesisStreamsOutput = {
            ResourceARN: { "Fn::GetAtt": [outputStreamId, "Arn"] },
            RoleARN: { "Fn::GetAtt": [analyticsStreamRoleId, "Arn"] }
          };
      }

      if (outputDeliveryStreamId !== null) {
        status.template.resources.Resources[analyticsStreamOutputId]
          .Properties.Output.KinesisFirehoseOutput = {
            // Kinesis Firehose ARN syntax (can't use GetAtt)
            // arn:aws:firehose:region:account-id:deliverystream/delivery-stream-name
            ResourceARN: {
              "Fn::Join": [
                "", 
                [ 
                  "arn:aws:firehose:", 
                  { Ref: "AWS::Region" },
                  ":",
                  { Ref: "AWS::AccountId" },
                  `:deliverystream/${outputDeliveryStreamId}`
                ]
              ]
            },
            RoleARN: { "Fn::GetAtt": [analyticsStreamRoleId, "Arn"] }
          };
      }

    },
    event: function () { }, // TODO
    policy: function () { } // TODO
  },
  schedule: {
    resource: function (status, node) {
      // Nothing to do
    },
    event: function (status, id, idFrom) {
      if (status.model.nodes[id].type === 'fn') {
        status.template.functions[id].events.push({
          schedule: "rate(5 minutes)"
        });
      } else {
        status.template.resources.Resources[id].Properties.Events['Schedule' + idFrom] = {
          Type: "Schedule",
          Properties: {
            Schedule: "rate(5 minutes)"
          }
        };  
      }      
    },
    policy: function () { } // This has no sense
  },
  topic: {
    resource: function (status, node) {
      status.template.resources.Resources[node.id] = {
        Type: "AWS::SNS::Topic"
      };
    },
    event: function (status, id, idFrom) {
      if (status.model.nodes[id].type === 'fn') {
        status.template.functions[id].events.push({
          sns: idFrom
        });
      } else {
        status.template.resources.Resources[id].Properties.Events['Topic' + idFrom] = {
          Type: "SNS",
          Properties: {
            Topic: { Ref: idFrom }
          }
        };
      }
    },
    policy: function (status, id, idTo) {
      return {
        Effect: "Allow",
        Action: "sns:Publish",
        Resource: { Ref: idTo } // For an SNS topic, it returns the ARN
      };
    },
  },
  fn: {
    resource: function (status, node) {
      // Check for and build a .gitignore if we haven't already
      if (!status.files[".gitignore"]) {
        status.files[".gitignore"] = runtimes[status.runtime].gitignore;
      }
      status.template.functions[node.id] = {
        handler: node.id + "." + runtimes[status.runtime].handler
      };
      if (node.description !== '') {
        status.template.functions[node.id].description = node.description;
      }
      status.files[node.id + '.' + runtimes[status.runtime].fileExtension] =
        runtimes[status.runtime].startingCode;

      if (node.from.length > 0) { // There are triggers for this function
        status.template.functions[node.id].events = [];
        node.from.forEach(function (idFrom) {
          console.log("Trigger " + idFrom + " -> " + node.id);
          renderingRules[status.model.nodes[idFrom].type].event(status, node.id, idFrom);
        });
      }
      if (node.to.length > 0) { // There are resources target of this function
        var policy = {
          Version: "2012-10-17",
          Statement: []
        };
        node.to.forEach(function (idTo) {
          console.log("Policy " + node.id + " -> " + idTo);
          policy.Statement.push(
            renderingRules[status.model.nodes[idTo].type]
              .policy(status, node.id, idTo)
          );
        });

        if (status.model.nodes[node.id].type !== 'fn') {
          status.template.resources.Resources[node.id].Properties.Policies.push(policy);
        }
      }
    },
    event: function () { }, // Nothing to do, this is not a trigger, but a fn to fn invocation
    policy: function (status, id, idTo) {
      return {
        Effect: "Allow",
        Action: ["lambda:Invoke", "lambda:InvokeAsync"],
        Resource: { "Fn::GetAtt": [idTo, "Arn"] }
      };
    }
  },
  stepFn: {
    resource: function (status, node) {
      status.template.resources.Resources[node.id] = {
        Type: "AWS::StepFunctions::StateMachine",
        Properties: {
          // The DefinitionString is added later
          // This role is automatically created by the AWS console
          // the first time you create a state machine in a region
          RoleArn: {
            "Fn::Join": [
              "", 
              [ 
                "arn:aws:iam::", 
                { Ref: "AWS::AccountId" },
                ":role/service-role/StatesExecutionRole-",
                { Ref: "AWS::Region" }
              ]
            ]
          },
        },
      };
      var definitionString = {
        Comment: "A Hello World example",
        StartAt: "HelloWorld",
        States: {
          HelloWorld: {
            Type: "Pass",
            Result: "Hello World!",
            End: true
          }
        }
      };
      // The DefinitionString must be a string with JSON syntax within the template
      status.template.resources.Resources[node.id].Properties.DefinitionString =
        JSON.stringify(definitionString, null, 2);
    },
    event: function () { }, // Nothing to do
    policy: function (status, id, idTo) {
      return {
        "Effect": "Allow",
        "Action": [
          "states:DescribeExecution",
          "states:GetExecutionHistory",
          "states:ListExecutions",
          "states:StartExecution",
          "states:StopExecution"
        ],
        "Resource": [
          { Ref: idTo }
        ]
      };
    }
  },
  cognitoIdentity: {
    resource: function (status, node) {
      var cognitoUnauthRoleId = node.id + "CognitoUnauthRole";
      var cognitoUnauthPolicyId = node.id + "CognitoUnauthPolicy";
      status.template.resources.Resources[node.id] = {
        Type: "AWS::Cognito::IdentityPool",
        Properties: {
          AllowUnauthenticatedIdentities: true // TODO Maybe this is not a secure default ???
        }
      };
      status.template.resources.Resources[cognitoUnauthRoleId] = {
        Type: 'AWS::IAM::Role',
        Properties: {
          AssumeRolePolicyDocument: {
            Version: '2012-10-17',
            Statement: [{
              Effect: "Allow",
              Principal: { Federated: "cognito-identity.amazonaws.com" },
              Action: 'sts:AssumeRoleWithWebIdentity',
              Condition: {
                StringEquals: {
                  "cognito-identity.amazonaws.com:aud": { Ref: node.id }
                },
                "ForAnyValue:StringLike": {
                  "cognito-identity.amazonaws.com:amr": "unauthenticated"
                }
              }
            }]
          }
        }
      };
      // Create a delivery policy for the role
      status.template.resources.Resources[cognitoUnauthPolicyId] = {
        Type: 'AWS::IAM::Policy',
        Properties: {
          PolicyName: "cognito_unauth_policy",
          PolicyDocument: {
            Version: '2012-10-17',
            Statement: []
          },
          Roles: [ { Ref: cognitoUnauthRoleId } ]
        }
      };
      // Output resources
      node.to.forEach(function (idTo) {
        // not used??? var node_to = status.model.nodes[idTo];
        status.template.resources.Resources[cognitoUnauthPolicyId]
          .Properties.PolicyDocument.Statement.push(
          renderingRules[status.model.nodes[idTo].type]
            .policy(status, node.id, idTo)
          );
      });
    },
    event: function () { }, // TODO ???
    policy: function () { } // TODO ???
  },
  iotRule: {
    resource: function (status, node) {
      status.template.resources.Resources[node.id] = {
        Type: "AWS::IoT::TopicRule",
        Properties: {
          TopicRulePayload: {
            RuleDisabled: "true", // safe choice
            Sql: "Select temp FROM 'Some/Topic' WHERE temp > 60",
            Actions: []
          }
        }
      };
      if (node.description !== '') {
        status.template.resources.Resources[node.id].Properties.TopicRulePayload.Description = node.description;
      }
      // Output resources
      node.to.forEach(function (idTo) {
        var node_to = status.model.nodes[idTo];
        switch (node_to.type) {
          case 'fn':
            status.template.resources.Resources[node.id].Properties.TopicRulePayload.Actions.push({
              Lambda: {
                FunctionArn: `${idTo}LambdaFunction`
              }
            });
            break;
          case 'iotRule': // republish
            var republishRoleId = idTo + "PublishRole";
            status.template.resources.Resources[node.id].Properties.TopicRulePayload.Actions.push({
              Republish: {
                Topic: "Output/Topic",
                RoleArn: { "Fn::GetAtt": [republishRoleId, "Arn"] }
              }
            });
            status.template.resources.Resources[republishRoleId] = {
              Type: "AWS::IAM::Role",
              Properties: {
                AssumeRolePolicyDocument: {
                  Version: "2012-10-17",
                  Statement: [{
                    Effect: "Allow",
                    Action: [ "sts:AssumeRole" ],
                    Principal: {
                      Service: [ "iot.amazonaws.com" ]
                    }
                  }]
                },
                Policies: [{
                  PolicyName: "publish",
                  PolicyDocument: {
                    Version: "2012-10-17",
                    Statement: [{
                      Effect: "Allow",
                      Action: "iot:Publish",
                      Resource: {
                        "Fn::Join": [
                          "",
                          [
                            "arn:aws:iot:",
                            { Ref: "AWS::Region" },
                            ":",
                            { Ref: "AWS::AccountId" },
                            ":topic/Outpu/*"
                          ]
                        ]
                      }
                    }]
                  }
              }]
              }
            };
            break;
          default:
            throw "Error: connection type not supported (" + node_to.type + ")";
        }
      });
    },
    event: function () { },
    policy: function () { }
  }
};

function render(model, runtime, deployment) {
  console.log('Using Serverless Framework...');
  var files = {};
  var template = {
    service: "serverless",
    provider: {
      name: "aws",
      runtime: runtime
    },
    functions: { },
    resources: { 
      Resources: { },
      Outputs: { }
    }
  };

  var status = {
    model: model,
    runtime: runtime,
    files: files,
    template: template
  };

  for (var id in model.nodes) {
    var node = model.nodes[id];
    renderingRules[node.type].resource(status, node);
  }

  console.log(template); // Still in JSON
  console.log(JSON.stringify(template, null, 4)); // JSON -> text

  for (var r in template.Resources) {
    console.log(r + " -> YAML");
    console.log(jsyaml.safeDump(template.Resources[r], { lineWidth: 1024 }));
  }

  // Line breaks can introduce YAML syntax (e.g. >-) that will put some variables
  // (e.g. AWS::Region) between quotes.
  // Single quotes must be removed for functions (e.g. Fn::GetAtt) to work.
  files['serverless.yml'] = jsyaml.safeDump(template, { lineWidth: 1024 }).replace(/'(!.+)'/g, "$1");
  
  return files;
}

module.exports = render;