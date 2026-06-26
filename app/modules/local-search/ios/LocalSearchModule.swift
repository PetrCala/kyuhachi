import ExpoModulesCore
import MapKit

/// Thin bridge over `MKLocalSearch`. Given a query and a circular region, it
/// returns nearby Apple Maps points of interest. Online-only (Apple performs a
/// network lookup); the JS side handles offline/empty results.
public final class LocalSearchModule: Module {
  public func definition() -> ModuleDefinition {
    Name("LocalSearch")

    AsyncFunction("search") {
      (query: String,
       latitude: Double,
       longitude: Double,
       radiusMeters: Double,
       categories: [String]?,
       promise: Promise) in

      let request = MKLocalSearch.Request()
      request.naturalLanguageQuery = query

      // A circle of `radiusMeters` fits inside a region whose sides are 2R.
      let center = CLLocationCoordinate2D(latitude: latitude, longitude: longitude)
      let side = max(radiusMeters, 1) * 2
      request.region = MKCoordinateRegion(
        center: center,
        latitudinalMeters: side,
        longitudinalMeters: side
      )
      request.resultTypes = [.pointOfInterest]

      // Constrain to native POI categories when the caller has equivalents
      // (supermarket, hotel, campsite); conbini / michi-no-eki rely on the query.
      if let categories, !categories.isEmpty {
        let poiCategories = categories.map { MKPointOfInterestCategory(rawValue: $0) }
        request.pointOfInterestFilter = MKPointOfInterestFilter(including: poiCategories)
      }

      MKLocalSearch(request: request).start { response, error in
        if let error {
          promise.reject("ERR_LOCAL_SEARCH", error.localizedDescription)
          return
        }
        let results: [[String: Any]] = (response?.mapItems ?? []).map { item in
          let coordinate = item.placemark.coordinate
          return [
            "name": item.name ?? "",
            "lat": coordinate.latitude,
            "lng": coordinate.longitude,
            "category": item.pointOfInterestCategory?.rawValue ?? "",
          ]
        }
        promise.resolve(results)
      }
    }
  }
}
