# ⚡️ Serverless Kinesis Management Plugin

[![npm](https://img.shields.io/npm/v/serverless-kinesis-stream-management.svg)](https://www.npmjs.com/package/serverless-kinesis-stream-management)
[![license](https://img.shields.io/github/license/trek10inc/serverless-kinesis-stream-management.svg)](https://github.com/trek10inc/serverless-kinesis-stream-management/blob/master/LICENSE.md)

## About the plugin

**HIGHLY EXPERIMENTAL AND WILL CHANGE.** We are building this strictly to meet our own needs, but are willing to consider and accommodate others if it betters the overall plugin!

This plugin serves to simplify the creation and management of Kinesis streams in AWS. All the configuration is done via CloudFormation as part of the normal package step of the Serverless Framework so you can easily review all changes before the take place.

A core goal is to limit the redundant task of creating the CloudFormation for a kinesis stream, a Firehose to archive it, etc.

## Limits

Each particular stream can support around 5 lambda subscribers before throttling becomes a large issue.

**NOTE:** If you are using the archive option of this plugin, you are limited to FOUR (4) lambda subscribers as the Kinesis Firehose will take one of your five slots.

## Future

In the future we hope to automate more of the operations, including intelligent auto-scaling of shards and potentially managed replication of streams as the subscriber interest grows against a particular stream.