#!/bin/bash

aws --profile cct codepipeline create-pipeline --cli-input-json file://codepipeline.json