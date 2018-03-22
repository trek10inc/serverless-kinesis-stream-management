'use strict';

const _ = require('lodash');

class KinesisStream {
    constructor(stream, defaults) {
        this.stream = stream;
        this.defaults = defaults;
        this.stream.cleanName = this.__sanitizeName(this.stream.name);
        this.config = _.merge(
            {
                retention: 24,
                shardCount: 1,
                keyId: 'alias/aws/kinesis',
                archiveTransformNewlines: false,
            },
            this.defaults,
            this.stream
        );
    }

    resources() {
        let resources = {};
        const streamResource = {
            Type: 'AWS::Kinesis::Stream',
            Properties: {
                Name: this.config.name,
                RetentionPeriodHours: this.config.retention,
                ShardCount: this.config.shardCount,
            },
        };

        if (this.config.keyId) {
            streamResource.Properties.StreamEncryption = {
                EncryptionType: 'KMS',
                KeyId: this.config.keyId,
            };
        }

        if (this.config.tags) {
            streamResource.Properties.Tags = this.config.tags;
        }

        // If we have archive, we need a firehose and all those managed magics
        if (this.config.archive) {
            resources = this._addFirehose(resources, {
                transformNewlines: this.config.archiveTransformNewlines,
            });
        }

        resources[`${this.config.cleanName}KinesisStream`] = streamResource;
        return resources;
    }

    _addFirehose(resources, transforms) {
        const archiveBucketResource = {
            Type: 'AWS::S3::Bucket',
            Properties: {
                BucketEncryption: {
                    ServerSideEncryptionConfiguration: [
                        {
                            ServerSideEncryptionByDefault: {
                                SSEAlgorithm: 'aws:kms',
                            },
                        },
                    ],
                },
            },
        };

        if (this.config.archiveBucket) {
            archiveBucketResource.Properties.BucketName = this.config.archiveBucket;
        }
        resources['KinesisStreamManagerArchiveBucket'] = archiveBucketResource;

        const firehoseIAMRole = {
            Type: 'AWS::IAM::Role',
            Properties: {
                AssumeRolePolicyDocument: {
                    Version: '2012-10-17',
                    Statement: [
                        {
                            Effect: 'Allow',
                            Principal: {
                                Service: 'firehose.amazonaws.com',
                            },
                            Action: 'sts:AssumeRole',
                            Condition: {
                                StringEquals: {
                                    'sts:ExternalId': {Ref: 'AWS::AccountId'},
                                },
                            },
                        },
                    ],
                },
                Policies: [
                    {
                        PolicyName: 'firehose-archive-kinesis',
                        PolicyDocument: {
                            Version: '2012-10-17',
                            Statement: [
                                {
                                    Effect: 'Allow',
                                    Action: [
                                        's3:AbortMultipartUpload',
                                        's3:GetBucketLocation',
                                        's3:GetObject',
                                        's3:ListBucket',
                                        's3:ListBucketMultipartUploads',
                                        's3:PutObject',
                                    ],
                                    Resource: [
                                        {
                                            'Fn::Sub':
                                                '${KinesisStreamManagerArchiveBucket.Arn}',
                                        },
                                        {
                                            'Fn::Sub':
                                                '${KinesisStreamManagerArchiveBucket.Arn}/*',
                                        },
                                    ],
                                },
                                {
                                    Effect: 'Allow',
                                    Action: [
                                        'kinesis:DescribeStream',
                                        'kinesis:GetShardIterator',
                                        'kinesis:GetRecords',
                                    ],
                                    Resource: {
                                        'Fn::Sub':
                                            'arn:aws:kinesis:${AWS::Region}:${AWS::AccountId}:stream/*',
                                    },
                                },
                                {
                                    Effect: 'Allow',
                                    Action: [
                                        'kms:Decrypt',
                                        'kms:GenerateDataKey',
                                    ],
                                    Resource: [
                                        {
                                            'Fn::Sub': `arn:aws:kms:region:\${AWS::Region}:key/*`, // TODO: security review
                                        },
                                    ],
                                    Condition: {
                                        StringEquals: {
                                            'kms:ViaService': {
                                                'Fn::Sub':
                                                    's3.${AWS::Region}.amazonaws.com',
                                            },
                                        },
                                        StringLike: {
                                            'kms:EncryptionContext:aws:s3:arn': {
                                                'Fn::Sub':
                                                    '${KinesisStreamManagerArchiveBucket}/*',
                                            },
                                        },
                                    },
                                },
                                {
                                    Effect: 'Allow',
                                    Action: ['logs:PutLogEvents'],
                                    Resource: ['*'],
                                },
                            ],
                        },
                    },
                ],
            },
        };
        resources['FirehoseIAMRole'] = firehoseIAMRole;

        const firehoseCloudWatchLogs = {
            Type: 'AWS::Logs::LogGroup',
            Properties: {
                RetentionInDays: 30,
            },
        };
        resources['FirehoseCloudWatchLogs'] = firehoseCloudWatchLogs;

        const firehoseResource = {
            Type: 'AWS::KinesisFirehose::DeliveryStream',
            Properties: {
                DeliveryStreamName: `${this.config.cleanName}KinesisFirehose`,
                DeliveryStreamType: 'KinesisStreamAsSource',
                KinesisStreamSourceConfiguration: {
                    KinesisStreamARN: {
                        'Fn::Sub': `\${${
                            this.config.cleanName
                        }KinesisStream.Arn}`,
                    },
                    RoleARN: {'Fn::Sub': '${FirehoseIAMRole.Arn}'},
                },
                ExtendedS3DestinationConfiguration: {
                    BucketARN: {
                        'Fn::Sub': '${KinesisStreamManagerArchiveBucket.Arn}',
                    },
                    BufferingHints: {
                        IntervalInSeconds: 60,
                        SizeInMBs: 1,
                    },
                    CloudWatchLoggingOptions: {
                        Enabled: true,
                        LogGroupName: {Ref: 'FirehoseCloudWatchLogs'},
                        LogStreamName: this.config.cleanName,
                    },
                    CompressionFormat: 'GZIP',
                    Prefix: `${this.config.name}/`,
                    RoleARN: {'Fn::Sub': '${FirehoseIAMRole.Arn}'},
                },
            },
        };

        if (transforms.transformNewlines) {
            const processorLambdaIAMRole = {
                Type: 'AWS::IAM::Role',
                Properties: {
                    AssumeRolePolicyDocument: {
                        Version: '2012-10-17',
                        Statement: [
                            {
                                Effect: 'Allow',
                                Principal: {
                                    Service: ['lambda.amazonaws.com'],
                                },
                                Action: ['sts:AssumeRole'],
                            },
                        ],
                    },
                    Policies: [
                        {
                            PolicyName: 'create-log-streams',
                            PolicyDocument: {
                                Version: '2012-10-17',
                                Statement: [
                                    {
                                        Effect: 'Allow',
                                        Action: [
                                            'logs:CreateLogGroup',
                                            'logs:CreateLogStream',
                                            'logs:PutLogEvents',
                                            'logs:DescribeLogStreams',
                                        ],
                                        Resource: ['*'],
                                    },
                                ],
                            },
                        },
                    ],
                    Path: '/',
                },
            };
            resources['ProcessLambdaIAMRole'] = processorLambdaIAMRole;
            const lambdaArchiveTransformNewlines = {
                Type: 'AWS::Lambda::Function',
                Properties: {
                    Code: {
                        ZipFile: {
                            'Fn::Join': [
                                '\n',
                                [
                                    'import base64',
                                    'def handler(event, context):',
                                    '    output = []',
                                    "    for record in event['records']:",
                                    "       payload = base64.b64decode(record['data'])+str.encode('\\n')",
                                    '       output_record = {',
                                    "           'recordId': record['recordId'],",
                                    "           'result': 'Ok',",
                                    "           'data': base64.b64encode(payload).decode('utf-8')",
                                    '       }',
                                    '       output.append(output_record)',
                                    "    return {'records': output}",
                                ],
                            ],
                        },
                    },
                    Handler: 'index.handler',
                    Runtime: 'python3.6',
                    Role: {'Fn::Sub': '${ProcessLambdaIAMRole.Arn}'},
                    Timeout: 60,
                },
            };

            firehoseResource.Properties.ExtendedS3DestinationConfiguration.ProcessingConfiguration = {
                Enabled: true,
                Processors: [
                    {
                        Type: 'Lambda',
                        Parameters: [
                            {
                                ParameterName: 'LambdaArn',
                                ParameterValue: {
                                    'Fn::Sub': '${ArchiveNewlineTransform.Arn}',
                                },
                            },
                            {
                                ParameterName: 'NumberOfRetries',
                                ParameterValue: 3,
                            },
                            {
                                ParameterName: 'RoleArn',
                                ParameterValue: {
                                    'Fn::Sub': '${FirehoseIAMRole.Arn}',
                                },
                            },
                        ],
                    },
                ],
            };

            resources[
                'ArchiveNewlineTransform'
            ] = lambdaArchiveTransformNewlines;
            const lambdaFirehosePermission = {
                Effect: 'Allow',
                Action: [
                    'lambda:InvokeFunction',
                    'lambda:GetFunctionConfiguration',
                ],
                Resource: [
                    {
                        'Fn::Sub': '${ArchiveNewlineTransform.Arn}*',
                    },
                ],
            };
            firehoseIAMRole.Properties.Policies[0].PolicyDocument.Statement.push(
                lambdaFirehosePermission
            );
        }

        resources[`${this.config.cleanName}KinesisFirehose`] = firehoseResource;
        return resources;
    }

    __sanitizeName(name) {
        let sanitizedName = name.replace(/([-|_|.]\w)/g, function(m) {
            return m[1].toUpperCase();
        });
        return sanitizedName.charAt(0).toUpperCase() + sanitizedName.slice(1);
    }
}

/****
 * Example Configs
 * custom:
 *   kinesisStreams:
 *     defaults: (optional global overrides)
 *       archiveBucket: {RandomlyNamedByCFN}
 *       archive: false
 *       encryption: true
 *       encryptionKey: alias/aws/kms
 *       retention: 24
 *       shardCount: 1
 *       archiveTransformNewlines: false
 *     streams:
 *       - name: MyStream (required)
 *         archiveBucket: (optional)
 *         archive: true (optional)
 *         keyId: alias/aws/kinesis (optional)
 *         retention: 24 (optional)
 *         shardCount: 1 (optional)
 *         archiveTransformNewlines: false
 *         tags:
 ***/

class KinesisStreamManager {
    constructor(serverless, options) {
        this.serverless = serverless;
        this.options = options;
        this.cli = this.serverless.cli;
        this.hooks = {
            'before:package:finalize': this.beforeCompileFunctions.bind(this),
        };
    }

    beforeCompileFunctions() {
        if (!_.has(this.serverless.service, 'custom.kinesisStreams.streams')) {
            return;
        }

        let defaults = {};
        if (_.has(this.serverless.service, 'custom.kinesisStreams.defaults')) {
            defaults = this.serverless.service.custom.kinesisStreams.defaults;
        }

        const streams = this.serverless.service.custom.kinesisStreams.streams.map(
            stream => new KinesisStream(stream, defaults)
        );

        streams.forEach(stream => {
            _.merge(
                this.serverless.service.provider.compiledCloudFormationTemplate
                    .Resources,
                stream.resources()
            );
        });
    }
}

module.exports = KinesisStreamManager;
