"use strict";

var express = require( "express" );
var router = express.Router();
var path = require( "path" );
var moment = require( "moment" );
var wkhtmltopdf = require( "wkhtmltopdf" );
var Mustache = require( "mustache" );
var fs = require( "fs" );
var _ = require( "lodash" );
var config = require( "../config.js" );

var routesMap = {
  "Alarm":"alarm",
  "Back Flow":"backflow",
  "Emergency Exit":"emergencyExit",
  "Extinguisher":"extinguishers",
  "Fire Pump":"firepump",
  "Grease Cleaning":"greaseCleaning",
  "Hood System":"hoodSystem",
  "Fire Hydrant":"hydrants",
  "Monitoring":"monitoring",
  "Sensitivity":"sensitivity",
  "Special Hazard":"specialHazard",
  "Sprinkler":"sprinkler",
  "Standpipe Hose":"standpipe",
  "Suppression":"suppression",
  "Work Order":"workOrder",
  "quote":"quote"
};

router.post( "/", getReport );
router.post( "/qrcodes", getQRCodes );

function getReport( req, res ) {
  var now = moment().toISOString();
  var report = routesMap[ getReportType( req.body ) ];

  var Firebase = require( "firebase" );
  var ref = new Firebase( "https://firelab-dev.firebaseio.com" );
  return ref.child( "Logos" ).child( req.body.clientId ).once( "value" ).then( function( logos ) {
    var logosVal = logos.val();
    req.body.logoDir = logosVal ? logosVal._l : "";
    req.body.imgAddDir = logosVal ? logosVal._a : "";
    return ref.child( "Images" ).child( req.body.$id ).once( "value" ).then( function( pics ) {
      var picsVal = pics.val();
      req.body.ownerSignature = _.get( picsVal.signatures, "ownerSignature", "" );
      req.body.inspectorSignature = _.get( picsVal.signatures, "inspectorSignature", "" );
      req.body.pictures = _.chunk( picsVal.pictures, 2 );
      var directory = path.resolve( __dirname, "../../reports/" + report );
      renameFiles( res, req.body, directory, now );
      return getPDFReport( res, directory, now, report );
    } );
  } );
}

function getQRCodes( req, res ) {
  var now = moment().toISOString();
  var directory = path.resolve( __dirname, "../../reports/qrcodes" );
  var io = new IOUtils( res, req.body, directory, now );
  var data = JSON.stringify( req.body );
  io.writeCtrl( );
  io.writeIndex( );
  io.writeFile( ".json", data );
  return getQRPDF( res, directory, now, req.body.length * 50 );
}

function getReportType( report ) {
  return _.get( report, "type", report.report );
}

function renameFiles( res, data, directory, now ) {
  var io = new IOUtils( res, data, directory, now );
  data.modifiedAt = moment( data.modifiedAt, "YYYY-MM-DD" ).format( "MM/DD/YYYY" );
  io.writeCtrl( );
  io.writeIndex( );
  io.writeHeader( );
  io.writeFile( ".json", JSON.stringify( data ) );
}

function IOUtils( res, data, directory, now ) {
  this.writeCtrl = writeCtrl;
  this.writeIndex = writeIndex;
  this.writeHeader = writeHeader;
  this.writeFile = writeFile;

  function writeCtrl( ) {
    var ctrlFile = fs.readFileSync( directory + "/reportController.js", "utf-8", error( res ) );
    var render = ctrlFile.replace( /\bdata\.json\b/g, now + ".json", error( res ) );
    this.writeFile( ".js", render );
  }

  function writeIndex( ) {
    var indexFile = fs.readFileSync( directory + "/index.html", "utf-8", error( res ) );
    var render = indexFile.replace( /\breportController\.js\b/g, now + ".js", error( res ) );
    this.writeFile( ".html", render );
  }

  function writeHeader( ) {
    var contactDataPath = directory + "/../common/header-contactInfo.temp";
    var contactDataFile = fs.readFileSync( contactDataPath, "utf-8", error( res ) );
    var contactDataRender = Mustache.render( contactDataFile, {data: data} );
    var renderData = {data: data, "header-contactInfo": contactDataRender};
    var headerFile = fs.readFileSync( directory + "/header.html", "utf-8", error( res ) );
    var render = Mustache.render( headerFile, renderData );
    this.writeFile( "header.html", render );
  }

  function writeFile( path, file ) {
    fs.writeFileSync( directory + "/" + now + path, file, "utf-8", error( res ) );
  }
}

function error( res ) {
  return function( err ) {
    if ( err ) {
      return res.status( 500 ).send( err );
    }
  };
}

/**
 * Return report and remove the files generated by report
 *
 * @param res: http result
 * @param directory= url to html template
 * @param now: date to create report
 * @param options: options to wkhtmltopdf
 * @param directory: directory for generate report files
 * @return file in PDF format
 */
function generateReport( res, url, now, options, directory, files ) {
  var pdf = wkhtmltopdf( url + now + ".html", options || {} );
  pdf.pipe( res );
  pdf.on( "close", function( error ) {
    if ( error ) {
      console.log( error );
    }
    files.forEach( function( fileName ) {
      if (  fs.existsSync( directory + "/" + fileName ) ) {
        fs.unlink( directory + "/" + fileName );
      }
    } );
  } );//send report
}

function getPDFReport( res, directory, now, type ) {
  var urlParent = "http://localhost:" + config.PORT + "/static/";
  var completeUrl = urlParent + type + "/";
  var files = [ now + ".html", now + "header.html", now + ".json",
   now + ".js" ];
  return generateReport( res, completeUrl, now,
  { "pageSize": "Letter", "header-html": completeUrl +
   now + "header.html", "footer-html": completeUrl +
    "../common/blank.html", "footer-spacing": "2"}, directory, files );
}

function getQRPDF( res, directory, now, delay ) {
  var urlParent = "http://localhost:" + config.PORT + "/static/";
  var completeUrl = urlParent + "qrcodes/";
  var files = [ now + ".html", now + ".json", now + ".js" ];
  var options = {
    "page-size": "Letter",
    "margin-left": "0.71cm",
    "margin-right": "0cm",
    "header-html": completeUrl + "../common/blank.html",
    "header-spacing": "6",
    "javascript-delay": delay
  };
  return generateReport( res, completeUrl, now, options, directory, files );
}

module.exports = router;
