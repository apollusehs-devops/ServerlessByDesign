# Serverless By Design

![Serverless by Design screenshot](https://danilop.s3.amazonaws.com/Images/serverless-by-design.png)

Serverless By Design is a visual approach to serverless development:

- An application is a network of _nodes_ (serverless resources, such as Lambda functions or S3 buckets) connected by _edges_ (their relationships, for example a trigger or a data flow)
- _Edit_ an application adding nodes and edges following an _event-driven_ design
- _Import_ a previously exported application to continue working on it
- Choose a _runtime_, and _build_ your application (for example, using AWS SAM)
- Optionally use _canary_ or _linear_ deployments for your future updates
- Edit _templates_ and code files for the final configurations before deploying the application
- _Export_ an application to save it for later use in a JSON file
- Take a _picture_ of the application architecture to have a visual representation to share
- Fine tune the _physics_ used to place nodes and edges on the screen, for example enable/disable it or choose another solver

Serverless By Design runs in the browser and doesn't need an internet connection when installed locally.

A live version is available at: http://sbd.danilop.net

Think. Build. Repeat.

## License

Copyright (c) 2017 Danilo Poccia, http://danilop.net

This code is licensed under the The MIT License (MIT). Please see the LICENSE file that accompanies this project for the terms of use.


## Installation

You need `node` and `npm`. Just run:

```
npm run build
```

to build it for production, then open `dist/index.html` with your favourite browser.

For a development build, that you can debug with a browser, use:

```
npm run dev
```


## Usage

Here are a few examples to help you start:

- [Basic API](https://sbd.danilop.net/?import=examples/basic-api.json)
- [S3 Processing](https://sbd.danilop.net/?import=examples/s3-processing.json)
- [Firehose Processing API](https://sbd.danilop.net/?import=examples/firehose.json)
- [Streaming Analytics](https://sbd.danilop.net/?import=examples/stream-test.json)
- [Some IoT](https://sbd.danilop.net/?import=examples/iot.json)
- [All Together Now](https://sbd.danilop.net/?import=examples/full-app.json)


## Dependencies

This code depends on:
- [Vis.js](http://visjs.org)
- [js-yaml](http://nodeca.github.io/js-yaml/)
- [FileSaver.js](https://github.com/eligrey/FileSaver.js/)
- [jszip](https://stuk.github.io/jszip/)
- [font-awesome](http://fontawesome.io)
- [JQuery](https://jquery.com)
