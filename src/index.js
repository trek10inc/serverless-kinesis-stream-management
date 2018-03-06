'use strict';

const _ = require('lodash');

class KinesisStream {
    constructor(stream, defaults) {
        this.defaults = defaults;
    }

    resources() {
        return [{test: 'thing'}];
    }
}

class KinesisStreamManager {
    constructor(serverless, options) {
        this.serverless = serverless;
        this.options = options;
        this.cli = this.serverless.cli;
        this.hooks = {
            'before:package:compileFunctions': this.beforeCompileFunctions.bind(
                this
            ),
        };
    }

    beforeCompileFunctions() {
        if (!_.has(this.serverless.service, 'custom.kinesis-streams.streams')) {
            return;
        }

        let defaults = {};
        if (_.has(this.serverless.service, 'custom.kinesis-streams.defaults')) {
            defaults = this.serverless.service.custom['kinesis-streams']
                .defaults;
        }

        const streams = this.serverless.service.custom[
            'kinesis-streams'
        ].streams.map(stream => new KinesisStream(stream, defaults));

        streams.forEach(stream =>
            stream.resources().forEach(resource => {
                _.merge(
                    this.serverless.service.provider
                        .compiledCloudFormationTemplate.Resources,
                    resource
                );
            })
        );
        this.cli.log(JSON.stringify(streams));
    }
}

module.exports = KinesisStreamManager;
