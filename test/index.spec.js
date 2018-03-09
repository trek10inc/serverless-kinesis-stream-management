'use strict';

const KinesisStreamManager = require('../');

it('creates basic CloudFormation with minimal config', () => {
    let config = {
        service: {
            custom: {
                kinesisStreams: {
                    streams: [
                        {name: 'Test'}
                    ]
                },
            },
            provider: {
                compiledCloudFormationTemplate: {
                    Resources: {},
                },
            },
        },
    };

    const test = new KinesisStreamManager(config);
    test.beforeCompileFunctions();

    const data =
        config.service.provider.compiledCloudFormationTemplate.Resources;

    expect(data).toHaveProperty('TestKinesisStream');
    expect(data.TestKinesisStream).toEqual({
        Type: 'AWS::Kinesis::Stream',
        Properties: {
            Name: 'Test',
            RetentionPeriodHours: 24,
            ShardCount: 1,
            StreamEncryption: {
                EncryptionType: 'KMS',
                KeyId: 'alias/aws/kinesis',
            },
        },
    });
});


it('supports multiple streams', () => {
    let config = {
        service: {
            custom: {
                kinesisStreams: {
                    streams: [
                        {name: 'Foo'},
                        {name: 'Bar'}
                    ]
                },
            },
            provider: {
                compiledCloudFormationTemplate: {
                    Resources: {},
                },
            },
        },
    };

    const test = new KinesisStreamManager(config);
    test.beforeCompileFunctions();

    const data =
        config.service.provider.compiledCloudFormationTemplate.Resources;

    expect(data).toHaveProperty('FooKinesisStream');
    expect(data.FooKinesisStream).toEqual({
        Type: 'AWS::Kinesis::Stream',
        Properties: {
            Name: 'Foo',
            RetentionPeriodHours: 24,
            ShardCount: 1,
            StreamEncryption: {
                EncryptionType: 'KMS',
                KeyId: 'alias/aws/kinesis',
            },
        },
    });
    expect(data).toHaveProperty('BarKinesisStream');
    expect(data.BarKinesisStream).toEqual({
        Type: 'AWS::Kinesis::Stream',
        Properties: {
            Name: 'Bar',
            RetentionPeriodHours: 24,
            ShardCount: 1,
            StreamEncryption: {
                EncryptionType: 'KMS',
                KeyId: 'alias/aws/kinesis',
            },
        },
    });
});

it('allows global defaults and stream based overrides', () => {
    let config = {
        service: {
            custom: {
                kinesisStreams: {
                    defaults: {
                        retention: 72,
                        shardCount: 4
                    },
                    streams: [
                        {
                            name: 'Foo',
                            retention: 12
                        },
                        {
                            name: 'Bar',
                            shardCount: 8
                        }
                    ]
                },
            },
            provider: {
                compiledCloudFormationTemplate: {
                    Resources: {},
                },
            },
        },
    };

    const test = new KinesisStreamManager(config);
    test.beforeCompileFunctions();

    const data =
        config.service.provider.compiledCloudFormationTemplate.Resources;

    expect(data).toHaveProperty('FooKinesisStream');
    expect(data.FooKinesisStream).toEqual({
        Type: 'AWS::Kinesis::Stream',
        Properties: {
            Name: 'Foo',
            RetentionPeriodHours: 12,
            ShardCount: 4,
            StreamEncryption: {
                EncryptionType: 'KMS',
                KeyId: 'alias/aws/kinesis',
            },
        },
    });
    expect(data).toHaveProperty('BarKinesisStream');
    expect(data.BarKinesisStream).toEqual({
        Type: 'AWS::Kinesis::Stream',
        Properties: {
            Name: 'Bar',
            RetentionPeriodHours: 72,
            ShardCount: 8,
            StreamEncryption: {
                EncryptionType: 'KMS',
                KeyId: 'alias/aws/kinesis',
            },
        },
    });
});
it('does not fail without configuration', () => {
    let config = {
        getProvider: () => ({getRegion: () => 'test-region'}),
        service: {
            custom: {},
            provider: {
                compiledCloudFormationTemplate: {
                    Resources: {},
                },
            },
        },
    };

    const test = new KinesisStreamManager(config);
    test.beforeCompileFunctions();

    const data =
        config.service.provider.compiledCloudFormationTemplate.Resources;

    expect(data).toEqual({})
});
