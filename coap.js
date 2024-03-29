/*
 *      Document   : coap
 *      Created on : Nov 7, 2012, 10:48:57 AM
 *      Author     : Mr.Nam
 */
/// Constants
var coapMessageType = {
  "CON" : 0,
  "NON" : 1,
  "ACK" : 2,
  "RST" : 3
}
var coapCode = {
  "CONTENT" : 69,
  "NOTFOUND" : 132
}
var coapMethod = {
  "GET" : 1,
  "POST" : 2,
  "PUT" : 3,
  "DELETE" : 4
}
var coapOptionType = {
  "CONTENT_TYPE" : 1,
  "MAX_AGE" : 2,
  "PROXY_URI" : 3,
  "ETAG" : 4,
  "URI_HOST" : 5,
  "LOCATION_PATH" : 6,
  "URI_PORT" : 7,
  "LOCATION_QUERY" : 8,
  "URI_PATH" : 9,
  "OBSERVE" : 10,
  "TOKEN" : 11,
  "ACCEPT" : 12,
  "IF_MATCH" : 13,
  "URI_QUERY" : 15,
  "IF_NONE_MATCH" : 21
}
/// Coap message and option objects
function CoapMessage(){
  this.version = 1;
  this.type = 0;
  this.optionCount = 0;
  this.code = 0;
  this.id = 0;
  this.options = [];
  this.payload = 0;
}

function CoapOption(){
  this.option = 0;
  this.length = 0;
  this.value = 0;
}

/// Packet masks
var versionMask = parseInt('11000000',2);
var typeMask = parseInt('00110000',2);
var optionCountMask = parseInt('00001111',2);
var optionDeltaMask = parseInt('11110000',2);
var optionShortLength = parseInt('00001111',2);

/// Deserialize a buffer to CoAP message object
function deserialize(buffer){
  var coapResponse = new CoapMessage();// the CoAP object to be filled
  coapResponse.version = (buffer[0] & versionMask) >> 6;
  coapResponse.type = (buffer[0] & typeMask) >> 4;
  coapResponse.optionCount = (buffer[0] & optionCountMask);
  coapResponse.code = buffer[1];
  coapResponse.id = buffer[2] * 256 + buffer[3];

  /// Retreiving the options from buffer to CoAP object
  var index = 4;
  var i = 0;
  var prevOption = 0;
  for (i = 0; i < coapResponse.optionCount; i++){
    var aResponseOption = new CoapOption(); // an Option to be filled
    aResponseOption.option = ((buffer[index] & optionDeltaMask) >> 4) + prevOption;
    var shortLength = buffer[index] & optionShortLength;
    var longLength = 0;
    index ++;
    if (shortLength == 15){
      longLength = buffer[index];
      index ++;
    }

    aResponseOption.length = shortLength + longLength;
    var optionValueBuffer = new Uint8Array(aResponseOption.length);
    var j = 0;
    for (j = 0; j < aResponseOption.length;j++){
      optionValueBuffer[j] = buffer[index];
      index ++;
    }
    aResponseOption.value = optionValueBuffer;

    prevOption = aResponseOption.option;
  }

  /// Check if there is payload
  if (index < buffer.length){
    var payloadLength = buffer.length - index;
    var payloadBuffer = new Uint8Array(payloadLength);
    var k = 0;
    for (k = 0; k < payloadLength; k++){
      payloadBuffer[k] = buffer[index];
      index ++;
    }
    coapResponse.payload = payloadBuffer;
  }

  return coapResponse;
}

/// Serialize a CoAP message object and a CoAP host into a wscoap packet
function serialize(coapMessage,coapHost){
  var index = 0;
  var buffer = new Uint8Array(100);// Buffer to hold the CoAP packet (wihout wscoap header)
  buffer[0] = coapMessage.version << 6;
  buffer[0] |= coapMessage.type << 4;
  buffer[0] |= coapMessage.optionCount;
  buffer[1] = coapMessage.code;
  buffer[2] = coapMessage.id/256;
  buffer[3] = coapMessage.id%256;

  index += 4;
  var options = coapMessage.options;
  var i = 0;
  var prevOption = 0;
  for (i = 0; i<options.length;i++){
    var delta = options[i].option - prevOption;
    buffer[index] = delta << 4;

    if (options[i].length < 15){
      buffer[index] |= options[i].length;
      index ++;
    } else {
      buffer[index] |= 15;
      buffer[index + 1] = options[i].length - 15;
      index += 2;
    }

    if ((options[i].option == coapOptionType.PROXY_URI) ||
      (options[i].option == coapOptionType.URI_HOST) ||
      (options[i].option == coapOptionType.LOCATION_PATH) ||
      (options[i].option == coapOptionType.LOCATION_QUERY) ||
      (options[i].option == coapOptionType.URI_PATH) ||
      (options[i].option == coapOptionType.URI_QUERY)){
      // String option
      var j = 0;
      for (j=0; j< options[i].length; j++){
        buffer[index + j] = options[i].value.charCodeAt(j);
      }
    }
    else if ((options[i].option == coapOptionType.CONTENT_TYPE) ||
      (options[i].option == coapOptionType.MAX_AGE) ||
      (options[i].option == coapOptionType.URI_PORT) ||
      (options[i].option == coapOptionType.ACCEPT)){
      // uint option
      var a = options[i].value;
      var j = 0;
      while((a & 255) != 0){
        buffer[index + j] = a & 255;
        a = a >> 8;
        j++;
      }
    } else if (options[i].option == coapOptionType.OBSERVE){
    // Do nothing
    } else {
      // opaque
      var j = 0;
      for (j=0; j< options[i].length; j++){
        buffer[index + j] = options[i].value[j];
      }
    }
    index += options[i].length;
    prevOption = options[i].option;

  }
  if (coapMessage.payload){
    var j = 0;
    for (j = 0; j < coapMessage.payload.length; j++){
      buffer[index] = coapMessage.payload[j];
      index ++;
    }
  }
  /// returnBuffer is the wscoap buffer which has a wscoap header and the coap packet
  var returnBuffer = new ArrayBuffer(index + coapHost.length + 1);
  var returnBufferView = new Uint8Array(returnBuffer);
  var z = 0;
  /// Attaching the destined CoAP host and length to the wscoap packet
  returnBufferView[z] = coapHost.length;
  z++;
  var j = 0;
  for (j = 0; j< coapHost.length; j++){
    returnBufferView[z] = coapHost.charCodeAt(j);
    z++;
  }
  /// Attaching the actual CoAP packet to the wscoap packet
  var k = 0;
  for (k = 0;k<index;k++){
    returnBufferView[z] = buffer[k];
    z++;
  }
  return returnBuffer;
}

function initCoAPMessage(coapMessage){
  coapMessage.version = 1;
  coapMessage.type = coapMessageType.CON;
  coapMessage.code = coapMethod.GET;
  coapMessage.id = Math.floor(Math.random() * (65536));
  return coapMessage;
}

function createCoAPOption(requestOption,optionNumber,optionValue){
  requestOption.option = optionNumber;
  requestOption.value = optionValue;
  requestOption.length = optionValue.length;
}

function byteArr2int(byteArr){
  var d = 0;
  var bufferLength = byteArr.length;
  var i = 0;
  for (i = 0; i< bufferLength; i++){
    d += byteArr[i] << (8 * (bufferLength - 1 - i));
  }
  var e = parseInt(d,10);
  return e;
}

function byteArr2String(byteArr) {
  var result = "";
  for (var i = 0; i < byteArr.length; i++) {
    result += String.fromCharCode(parseInt(byteArr[i], 2));
  }
  return result;
}