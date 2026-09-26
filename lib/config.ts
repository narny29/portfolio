// Configuration for data source
export const config = {
  // Set to true to use S3 data, false to use local data
  // Can be controlled via environment variable NEXT_PUBLIC_USE_S3_DATA
  useS3Data: process.env.NEXT_PUBLIC_USE_S3_DATA === 'true',
  
  // S3 base URL
  s3BaseUrl: 'https://nayan-portfolio-1757776403.s3.ap-south-1.amazonaws.com/portfolio',
  
  // Local data path (relative to public folder)
  localDataPath: '/data'
}

// Helper function to get the data source URL
export const getDataSourceUrl = (folder: string): string => {
  if (config.useS3Data) {
    return `${config.s3BaseUrl}/${folder}.json`
  } else {
    return `${config.localDataPath}/${folder}.json`
  }
}
