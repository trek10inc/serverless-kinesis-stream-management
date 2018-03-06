'use strict';

const KinesisStreamManager = require('../');

// it('creates CloudFormation configuration', () => {
//     let config = {
//         getProvider: () => ({ getRegion: () => 'test-region' }),
//         service: {
//             custom: {
//                 'sqs-alarms': [
//                     {
//                         queue: 'test-queue',
//                         topic: 'test-topic',
//                         thresholds: [1, 2, 3]
//                     }
//                 ]
//             },
//             provider: {
//                 compiledCloudFormationTemplate: {
//                     Resources: {}
//                 }
//             }
//         }
//     }

//     const test = new Plugin(config)
//     test.beforeCompileFunctions()

//     const data = config.service.provider.compiledCloudFormationTemplate.Resources

//     expect(data).toHaveProperty('testqueueMessageAlarm3')
// })

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

    expect(data).not.toHaveProperty('ShouldntExistStream');
});
