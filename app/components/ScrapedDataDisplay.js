'use client'

import { useState, useEffect } from 'react'

export default function ScrapedDataDisplay() {
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    async function fetchData() {
      try {
        const response = await fetch('/api/getData')
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`)
        }
        const result = await response.json()
        setData(result)
      } catch (e) {
        setError(e.message)
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [])

  if (loading) return <p>Loading...</p>
  if (error) return <p>Error: {error}</p>

  return (
    <div>
      <h2>Scraped Professor Data</h2>
      {data.map((item, index) => (
        <div key={index} style={{border: '1px solid #ccc', margin: '10px', padding: '10px'}}>
          <h3>{item.metadata.name}</h3>
          <p>Department: {item.metadata.department}</p>
          <p>Overall Rating: {item.metadata.overallRating}</p>
          <p>Review: {item.metadata.review}</p>
          <p>Stars: {item.metadata.stars}</p>
        </div>
      ))}
    </div>
  )
}
