var onmessage = function(msg) {
    console.log(`worker got message = ${msg}`);
    postMessage(null);
}

